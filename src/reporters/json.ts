import type { ScanResult } from "../types.js";

/**
 * Formats a ScanResult into a stable, CI-friendly JSON string.
 */
export function formatJsonReport(result: ScanResult, pretty = true): string {
  return JSON.stringify(result, null, pretty ? 2 : undefined);
}
