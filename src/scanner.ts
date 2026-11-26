import { lstat, readdir, readlink, realpath } from "node:fs/promises";
import path from "node:path";
import { evaluateRules } from "./rules/index.js";
import type {
  EntryKind,
  Platform,
  ScanError,
  ScanOptions,
  ScanResult,
  ScannedEntry,
} from "./types.js";

export const DEFAULT_EXCLUDES: readonly string[] = [".git", "node_modules"];
export const DEFAULT_MAX_DIAGNOSTICS = 1000;

export class ScannerOperationalError extends Error {
  readonly code: string;

  constructor(message: string, code = "ERR_SCANNER") {
    super(message);
    this.name = "ScannerOperationalError";
    this.code = code;
  }
}

function normalizeRelPath(relPath: string): string {
  return relPath.split(path.sep).join("/");
}

function isInsideRoot(rootRealPath: string, candidatePath: string): boolean {
  const rel = path.relative(rootRealPath, candidatePath);
  if (rel === "") {
    return true;
  }
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

function matchesExclude(name: string, relativePath: string, excludes: readonly string[]): boolean {
  for (const pattern of excludes) {
    if (pattern === name || pattern === relativePath) {
      return true;
    }
    // Simple prefix/suffix wildcard support without ReDoS risk
    if (pattern.startsWith("*") && pattern.length > 1) {
      const suffix = pattern.slice(1);
      if (name.endsWith(suffix)) {
        return true;
      }
    } else if (pattern.endsWith("*") && pattern.length > 1) {
      const prefix = pattern.slice(0, -1);
      if (name.startsWith(prefix) || relativePath.startsWith(prefix)) {
        return true;
      }
    }
  }
  return false;
}

function getErrnoCode(err: unknown): string {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") {
      return code;
    }
  }
  return "UNKNOWN";
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

async function inspectSymlink(
  fullPath: string,
  parentDir: string,
  rootRealPath: string,
): Promise<{
  symlinkTarget?: string;
  symlinkRealPath?: string;
  symlinkEscapesRoot?: boolean;
  symlinkLoop?: boolean;
  symlinkBroken?: boolean;
}> {
  let symlinkTarget: string | undefined;
  try {
    symlinkTarget = await readlink(fullPath);
  } catch {
    return { symlinkBroken: true };
  }

  const lexicalTarget = path.resolve(parentDir, symlinkTarget);
  const lexicalEscapes = !isInsideRoot(rootRealPath, lexicalTarget);

  try {
    const resolved = await realpath(fullPath);
    const realEscapes = !isInsideRoot(rootRealPath, resolved);
    return {
      symlinkTarget,
      symlinkRealPath: resolved,
      symlinkEscapesRoot: lexicalEscapes || realEscapes,
      symlinkLoop: false,
      symlinkBroken: false,
    };
  } catch (err) {
    const code = getErrnoCode(err);
    if (code === "ELOOP") {
      return {
        symlinkTarget,
        symlinkEscapesRoot: lexicalEscapes,
        symlinkLoop: true,
        symlinkBroken: false,
      };
    }
    return {
      symlinkTarget,
      symlinkEscapesRoot: lexicalEscapes,
      symlinkLoop: false,
      symlinkBroken: true,
    };
  }
}

/**
 * Performs a read-only cross-platform filename compatibility scan on a directory.
 */
export async function scanRepository(options: ScanOptions): Promise<ScanResult> {
  const startTime = performance.now();
  const platform: Platform = options.platform ?? "all";
  const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;
  const maxDiagnostics = options.maxDiagnostics ?? DEFAULT_MAX_DIAGNOSTICS;

  if (!Number.isFinite(maxDiagnostics) || maxDiagnostics < 1) {
    throw new ScannerOperationalError(
      `Invalid maxDiagnostics value: ${String(options.maxDiagnostics)}. Expected a positive integer.`,
      "ERR_INVALID_OPTION",
    );
  }

  if (options.maxDepth !== undefined && (!Number.isFinite(maxDepth) || maxDepth < 1)) {
    throw new ScannerOperationalError(
      `Invalid maxDepth value: ${String(options.maxDepth)}. Expected a positive integer.`,
      "ERR_INVALID_OPTION",
    );
  }

  const resolvedRootInput = path.resolve(options.rootPath);
  let rootStat;
  try {
    rootStat = await lstat(resolvedRootInput);
  } catch (err) {
    throw new ScannerOperationalError(
      `Cannot access scan path '${resolvedRootInput}': ${getErrorMessage(err)}`,
      getErrnoCode(err),
    );
  }

  if (!rootStat.isDirectory()) {
    throw new ScannerOperationalError(
      `Scan path '${resolvedRootInput}' is not a directory.`,
      "ENOTDIR",
    );
  }

  let rootRealPath: string;
  try {
    rootRealPath = await realpath(resolvedRootInput);
  } catch (err) {
    throw new ScannerOperationalError(
      `Cannot resolve scan path '${resolvedRootInput}': ${getErrorMessage(err)}`,
      getErrnoCode(err),
    );
  }

  const excludedPatterns: string[] = [
    ...(options.noDefaultExcludes === true ? [] : DEFAULT_EXCLUDES),
    ...(options.exclude ?? []),
  ];

  const entries: ScannedEntry[] = [];
  const errors: ScanError[] = [];
  let scannedFiles = 0;
  let scannedDirectories = 0;
  let scannedSymlinks = 0;
  let skippedEntries = 0;

  async function walk(currentDir: string, parentRelPath: string, depth: number): Promise<void> {
    if (depth > maxDepth) {
      return;
    }

    let dirEntries;
    try {
      dirEntries = await readdir(currentDir, { withFileTypes: true });
    } catch (err) {
      errors.push({
        path: parentRelPath === "" ? "." : parentRelPath,
        code: getErrnoCode(err),
        message: getErrorMessage(err),
      });
      return;
    }

    // Sort deterministically by code unit order
    dirEntries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const dirent of dirEntries) {
      const name = dirent.name;
      const relativePath = parentRelPath === "" ? name : `${parentRelPath}/${name}`;

      if (matchesExclude(name, relativePath, excludedPatterns)) {
        skippedEntries += 1;
        continue;
      }

      const fullPath = path.join(currentDir, name);
      let kind: EntryKind = "other";

      if (dirent.isSymbolicLink()) {
        kind = "symlink";
        scannedSymlinks += 1;
      } else if (dirent.isDirectory()) {
        kind = "directory";
        scannedDirectories += 1;
      } else if (dirent.isFile()) {
        kind = "file";
        scannedFiles += 1;
      }

      if (kind === "symlink") {
        const symInfo = await inspectSymlink(fullPath, currentDir, rootRealPath);
        entries.push({
          name,
          relativePath,
          parentRelativePath: parentRelPath,
          kind,
          depth,
          ...symInfo,
        });
        // Never recurse into symlinks
        continue;
      }

      entries.push({
        name,
        relativePath,
        parentRelativePath: parentRelPath,
        kind,
        depth,
      });

      if (kind === "directory" && depth < maxDepth) {
        await walk(fullPath, relativePath, depth + 1);
      }
    }
  }

  await walk(rootRealPath, "", 1);

  const allDiagnostics = evaluateRules(entries, platform);
  const truncated = allDiagnostics.length > maxDiagnostics;
  const diagnostics = truncated ? allDiagnostics.slice(0, maxDiagnostics) : allDiagnostics;

  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  for (const diag of diagnostics) {
    if (diag.severity === "error") {
      errorCount += 1;
    } else if (diag.severity === "warning") {
      warningCount += 1;
    } else {
      infoCount += 1;
    }
  }

  const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

  return {
    schemaVersion: "1.0.0",
    rootPath: normalizeRelPath(rootRealPath),
    platform,
    excludedPatterns,
    diagnostics,
    summary: {
      total: diagnostics.length,
      error: errorCount,
      warning: warningCount,
      info: infoCount,
    },
    stats: {
      scannedEntries: entries.length,
      scannedFiles,
      scannedDirectories,
      scannedSymlinks,
      skippedEntries,
      truncated,
      durationMs,
    },
    errors,
  };
}
