import type { Diagnostic, ScanResult } from "../types.js";

function formatSeverityLabel(severity: Diagnostic["severity"]): string {
  return severity.toUpperCase().padEnd(7, " ");
}

/**
 * Formats a ScanResult into a human-readable plain-text report.
 */
export function formatTextReport(result: ScanResult): string {
  const lines: string[] = [];

  lines.push(`PathPort scan: ${result.rootPath}`);
  lines.push(
    `Target platform: ${result.platform} | Scanned: ${result.stats.scannedEntries} entries (${result.stats.scannedFiles} files, ${result.stats.scannedDirectories} dirs, ${result.stats.scannedSymlinks} symlinks) | Skipped: ${result.stats.skippedEntries}`,
  );
  lines.push("");

  if (result.diagnostics.length === 0) {
    lines.push("No cross-platform filename issues found.");
  } else {
    for (const diag of result.diagnostics) {
      const label = formatSeverityLabel(diag.severity);
      const platforms = diag.platforms.join(",");
      lines.push(`[${label}] ${diag.ruleId} (${diag.ruleName}) [${platforms}]`);
      lines.push(`  Path:        ${diag.path}`);
      if (diag.relatedPaths !== undefined && diag.relatedPaths.length > 0) {
        lines.push(`  Related:     ${diag.relatedPaths.join(", ")}`);
      }
      lines.push(`  Issue:       ${diag.message}`);
      lines.push(`  Why:         ${diag.explanation}`);
      lines.push(`  Remediation: ${diag.remediation}`);
      lines.push("");
    }
  }

  if (result.errors.length > 0) {
    lines.push("Operational errors during scan:");
    for (const err of result.errors) {
      lines.push(`  - ${err.path}: [${err.code}] ${err.message}`);
    }
    lines.push("");
  }

  if (result.stats.truncated) {
    lines.push(
      `Note: Output was truncated to ${result.diagnostics.length} diagnostics. Use --max-diagnostics to adjust.`,
    );
    lines.push("");
  }

  lines.push(
    `Summary: ${result.summary.total} finding(s) (${result.summary.error} error, ${result.summary.warning} warning, ${result.summary.info} info) in ${result.stats.durationMs}ms.`,
  );
  lines.push(
    "Note: Filesystem behavior varies by OS, filesystem (NTFS/APFS/ext4), mount options, and Git config (e.g. core.ignorecase, core.precomposeUnicode).",
  );

  return lines.join("\n");
}
