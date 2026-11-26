export { formatJsonReport } from "./reporters/json.js";
export { formatTextReport } from "./reporters/text.js";
export { evaluateRules, RULE_REGISTRY } from "./rules/index.js";
export {
  DEFAULT_EXCLUDES,
  DEFAULT_MAX_DIAGNOSTICS,
  ScannerOperationalError,
  scanRepository,
} from "./scanner.js";
export type {
  Diagnostic,
  EntryKind,
  FailOnThreshold,
  OutputFormat,
  Platform,
  RuleDefinition,
  ScanError,
  ScanOptions,
  ScanResult,
  ScanStats,
  ScanSummary,
  ScannedEntry,
  Severity,
  TargetPlatform,
} from "./types.js";
