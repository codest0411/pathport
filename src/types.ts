export type Platform = "windows" | "macos" | "linux" | "all";
export type TargetPlatform = "windows" | "macos" | "linux";
export type Severity = "error" | "warning" | "info";
export type FailOnThreshold = "error" | "warning" | "info" | "none";
export type OutputFormat = "text" | "json";
export type EntryKind = "file" | "directory" | "symlink" | "other";

export interface ScannedEntry {
  /** Base name of the file, directory, or symlink. */
  readonly name: string;
  /** Forward-slash normalized path relative to the scan root. */
  readonly relativePath: string;
  /** Forward-slash normalized parent directory relative to the scan root ("" for root children). */
  readonly parentRelativePath: string;
  /** Filesystem entry kind observed via lstat. */
  readonly kind: EntryKind;
  /** Depth relative to the scan root (1 for direct children of root). */
  readonly depth: number;
  /** Raw symlink target from readlink, if kind === "symlink". */
  readonly symlinkTarget?: string;
  /** Resolved realpath of symlink target, if resolvable. */
  readonly symlinkRealPath?: string;
  /** True if the symlink target resolves outside the scan root. */
  readonly symlinkEscapesRoot?: boolean;
  /** True if a symlink loop (ELOOP) was detected. */
  readonly symlinkLoop?: boolean;
  /** True if the symlink target does not exist (ENOENT) or cannot be resolved. */
  readonly symlinkBroken?: boolean;
}

export interface Diagnostic {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly severity: Severity;
  readonly platforms: readonly TargetPlatform[];
  readonly path: string;
  readonly relatedPaths?: readonly string[];
  readonly message: string;
  readonly explanation: string;
  readonly remediation: string;
}

export interface RuleDefinition {
  readonly id: string;
  readonly name: string;
  readonly defaultSeverity: Severity;
  readonly platforms: readonly TargetPlatform[];
  readonly description: string;
}

export interface ScanOptions {
  /** Directory path to scan. */
  readonly rootPath: string;
  /** Target platform(s) to check compatibility for. Defaults to "all". */
  readonly platform?: Platform;
  /** Exact segment names or glob-like simple patterns to exclude. */
  readonly exclude?: readonly string[];
  /** Disable default exclusions (.git, node_modules). Defaults to false. */
  readonly noDefaultExcludes?: boolean;
  /** Maximum directory traversal depth (1 = direct children only). */
  readonly maxDepth?: number;
  /** Maximum number of diagnostics before truncating. Defaults to 1000. */
  readonly maxDiagnostics?: number;
}

export interface ScanStats {
  readonly scannedEntries: number;
  readonly scannedFiles: number;
  readonly scannedDirectories: number;
  readonly scannedSymlinks: number;
  readonly skippedEntries: number;
  readonly truncated: boolean;
  readonly durationMs: number;
}

export interface ScanError {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface ScanSummary {
  readonly total: number;
  readonly error: number;
  readonly warning: number;
  readonly info: number;
}

export interface ScanResult {
  readonly schemaVersion: "1.0.0";
  readonly rootPath: string;
  readonly platform: Platform;
  readonly excludedPatterns: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
  readonly summary: ScanSummary;
  readonly stats: ScanStats;
  readonly errors: readonly ScanError[];
}
