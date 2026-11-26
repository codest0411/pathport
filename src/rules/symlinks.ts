import type { Diagnostic, RuleDefinition, ScannedEntry } from "../types.js";

export const SYMLINK_RULES: readonly RuleDefinition[] = [
  {
    id: "PP010",
    name: "symlink-escapes-root",
    defaultSeverity: "warning",
    platforms: ["windows", "macos", "linux"],
    description: "Flags symbolic links whose resolved target points outside the scan root.",
  },
  {
    id: "PP011",
    name: "symlink-loop-or-broken",
    defaultSeverity: "warning",
    platforms: ["windows", "macos", "linux"],
    description: "Flags symbolic links that form a loop or point to a missing target.",
  },
];

export function checkSymlinkEntry(entry: ScannedEntry): Diagnostic[] {
  if (entry.kind !== "symlink") {
    return [];
  }

  const diagnostics: Diagnostic[] = [];

  if (entry.symlinkEscapesRoot === true) {
    diagnostics.push({
      ruleId: "PP010",
      ruleName: "symlink-escapes-root",
      severity: "warning",
      platforms: ["windows", "macos", "linux"],
      path: entry.relativePath,
      message: `Symbolic link '${entry.relativePath}' points outside the scan root (target: '${entry.symlinkTarget ?? "unknown"}').`,
      explanation:
        "Symlinks escaping the repository root are non-portable across machines and CI environments, and may expose unexpected host paths if followed by build tools or archivers.",
      remediation:
        "Replace the external symlink with a relative in-repository path or a regular file/configuration.",
    });
  }

  if (entry.symlinkLoop === true) {
    diagnostics.push({
      ruleId: "PP011",
      ruleName: "symlink-loop-or-broken",
      severity: "warning",
      platforms: ["windows", "macos", "linux"],
      path: entry.relativePath,
      message: `Symbolic link '${entry.relativePath}' forms a symlink loop (target: '${entry.symlinkTarget ?? "unknown"}').`,
      explanation:
        "Symlink cycles cause filesystem traversal tools and archivers to fail with ELOOP or recurse unexpectedly.",
      remediation:
        "Break the symlink cycle by pointing to a non-cyclic target or removing the link.",
    });
  } else if (entry.symlinkBroken === true) {
    diagnostics.push({
      ruleId: "PP011",
      ruleName: "symlink-loop-or-broken",
      severity: "warning",
      platforms: ["windows", "macos", "linux"],
      path: entry.relativePath,
      message: `Symbolic link '${entry.relativePath}' is broken (target: '${entry.symlinkTarget ?? "unknown"}').`,
      explanation:
        "Dangling symlinks behave inconsistently across platforms and packaging tools (especially on Windows where symlinks may require Developer Mode or elevated privileges).",
      remediation:
        "Update the symlink target to an existing in-repo path or remove the broken link.",
    });
  }

  return diagnostics;
}
