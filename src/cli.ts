import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { formatJsonReport } from "./reporters/json.js";
import { formatTextReport } from "./reporters/text.js";
import {
  DEFAULT_EXCLUDES,
  DEFAULT_MAX_DIAGNOSTICS,
  ScannerOperationalError,
  scanRepository,
} from "./scanner.js";
import type { FailOnThreshold, OutputFormat, Platform, ScanResult } from "./types.js";

const VALID_PLATFORMS = new Set<Platform>(["windows", "macos", "linux", "all"]);
const VALID_FORMATS = new Set<OutputFormat>(["text", "json"]);
const VALID_FAIL_ON = new Set<FailOnThreshold>(["error", "warning", "info", "none"]);

function getPackageVersion(): string {
  try {
    const pkgUrl = new URL("../package.json", import.meta.url);
    const raw = readFileSync(pkgUrl, "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function getHelpText(): string {
  return `pathport - Local-first cross-platform filename compatibility checker

Usage:
  pathport [options]

Options:
  -p, --path <directory>         Directory to scan (default: ".")
      --platform <target>        Target platform: windows | macos | linux | all (default: "all")
  -f, --format <format>          Output format: text | json (default: "text")
      --fail-on <severity>       Exit 1 if findings meet/exceed: error | warning | info | none (default: "error")
      --exclude <pattern>        Exclude name, relative path, or simple prefix/suffix * glob (repeatable)
      --no-default-excludes      Do not exclude default directories (${DEFAULT_EXCLUDES.join(", ")})
      --max-depth <n>            Maximum directory traversal depth (positive integer)
      --max-diagnostics <n>      Maximum diagnostics to emit (default: ${DEFAULT_MAX_DIAGNOSTICS})
  -h, --help                     Show this help message
  -v, --version                  Show version number

Exit codes:
  0  Scan completed with no findings at or above --fail-on threshold
  1  Scan completed and findings meet or exceed --fail-on threshold
  2  Invalid arguments or operational error
`;
}

export function shouldFailOnResult(result: ScanResult, threshold: FailOnThreshold): boolean {
  if (threshold === "none") {
    return false;
  }
  if (threshold === "error") {
    return result.summary.error > 0;
  }
  if (threshold === "warning") {
    return result.summary.error > 0 || result.summary.warning > 0;
  }
  return result.summary.total > 0;
}

function parsePositiveInt(raw: string, flagName: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new ScannerOperationalError(
      `Invalid value '${raw}' for ${flagName}. Expected a positive integer.`,
      "ERR_INVALID_ARG",
    );
  }
  const num = Number(raw);
  if (!Number.isSafeInteger(num) || num < 1) {
    throw new ScannerOperationalError(
      `Invalid value '${raw}' for ${flagName}. Expected a positive integer >= 1.`,
      "ERR_INVALID_ARG",
    );
  }
  return num;
}

export interface CliIo {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const DEFAULT_IO: CliIo = {
  stdout: (text: string) => {
    process.stdout.write(`${text}\n`);
  },
  stderr: (text: string) => {
    process.stderr.write(`${text}\n`);
  },
};

/**
 * Executes the PathPort CLI with the provided argv slice and returns the exit code.
 */
export async function runCli(
  argv: readonly string[] = process.argv.slice(2),
  io: CliIo = DEFAULT_IO,
): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: false,
      options: {
        path: { type: "string", short: "p" },
        platform: { type: "string" },
        format: { type: "string", short: "f" },
        "fail-on": { type: "string" },
        exclude: { type: "string", multiple: true },
        "no-default-excludes": { type: "boolean" },
        "max-depth": { type: "string" },
        "max-diagnostics": { type: "string" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    io.stderr(`Error: ${message}\nRun 'pathport --help' for usage information.`);
    return 2;
  }

  const { values } = parsed;

  if (values.help === true) {
    io.stdout(getHelpText());
    return 0;
  }

  if (values.version === true) {
    io.stdout(getPackageVersion());
    return 0;
  }

  const targetPath = values.path ?? ".";
  const platformRaw = values.platform ?? "all";
  const formatRaw = values.format ?? "text";
  const failOnRaw = values["fail-on"] ?? "error";

  if (!VALID_PLATFORMS.has(platformRaw as Platform)) {
    io.stderr(
      `Error: Invalid --platform '${platformRaw}'. Expected one of: windows, macos, linux, all.`,
    );
    return 2;
  }

  if (!VALID_FORMATS.has(formatRaw as OutputFormat)) {
    io.stderr(`Error: Invalid --format '${formatRaw}'. Expected one of: text, json.`);
    return 2;
  }

  if (!VALID_FAIL_ON.has(failOnRaw as FailOnThreshold)) {
    io.stderr(
      `Error: Invalid --fail-on '${failOnRaw}'. Expected one of: error, warning, info, none.`,
    );
    return 2;
  }

  try {
    const maxDepth =
      values["max-depth"] !== undefined
        ? parsePositiveInt(values["max-depth"], "--max-depth")
        : undefined;
    const maxDiagnostics =
      values["max-diagnostics"] !== undefined
        ? parsePositiveInt(values["max-diagnostics"], "--max-diagnostics")
        : undefined;

    const scanOptions = {
      rootPath: targetPath,
      platform: platformRaw as Platform,
      ...(values.exclude !== undefined ? { exclude: values.exclude } : {}),
      ...(values["no-default-excludes"] === true ? { noDefaultExcludes: true } : {}),
      ...(maxDepth !== undefined ? { maxDepth } : {}),
      ...(maxDiagnostics !== undefined ? { maxDiagnostics } : {}),
    };

    const result = await scanRepository(scanOptions);

    if (formatRaw === "json") {
      io.stdout(formatJsonReport(result));
    } else {
      io.stdout(formatTextReport(result));
    }

    return shouldFailOnResult(result, failOnRaw as FailOnThreshold) ? 1 : 0;
  } catch (err) {
    if (err instanceof ScannerOperationalError) {
      io.stderr(`Error [${err.code}]: ${err.message}`);
    } else {
      const message = err instanceof Error ? err.message : String(err);
      io.stderr(`Error: ${message}`);
    }
    return 2;
  }
}

// Run when invoked directly via bin/pathport.js or node dist/src/cli.js
const isDirectExecution =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("cli.js") || process.argv[1].endsWith("pathport.js"));

if (isDirectExecution) {
  const code = await runCli(process.argv.slice(2));
  process.exitCode = code;
}
