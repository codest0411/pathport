import type { Diagnostic, Platform, RuleDefinition, ScannedEntry } from "../types.js";
import { COLLISION_RULES, checkDirectoryCollisions } from "./collisions.js";
import { PATH_RULES, checkPathEntry } from "./paths.js";
import { SYMLINK_RULES, checkSymlinkEntry } from "./symlinks.js";
import { WINDOWS_RULES, checkWindowsEntry } from "./windows.js";

/**
 * Stable registry of all PathPort rules ordered by Rule ID.
 */
export const RULE_REGISTRY: readonly RuleDefinition[] = [
  ...WINDOWS_RULES,
  ...COLLISION_RULES,
  ...PATH_RULES,
  ...SYMLINK_RULES,
].sort((a, b) => a.id.localeCompare(b.id));

/**
 * Evaluates all applicable rules for the target platform against the scanned entries.
 */
export function evaluateRules(entries: readonly ScannedEntry[], platform: Platform): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const checkWin = platform === "all" || platform === "windows";

  for (const entry of entries) {
    if (checkWin) {
      diagnostics.push(...checkWindowsEntry(entry));
    }
    diagnostics.push(...checkPathEntry(entry, platform));
    diagnostics.push(...checkSymlinkEntry(entry));
  }

  diagnostics.push(...checkDirectoryCollisions(entries, platform));

  // Deterministic ordering: severity (error > warning > info), then path, then ruleId.
  const severityRank: Record<Diagnostic["severity"], number> = {
    error: 0,
    warning: 1,
    info: 2,
  };
  diagnostics.sort((a, b) => {
    const sevDiff = severityRank[a.severity] - severityRank[b.severity];
    if (sevDiff !== 0) {
      return sevDiff;
    }
    if (a.path !== b.path) {
      return a.path < b.path ? -1 : 1;
    }
    return a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0;
  });

  return diagnostics;
}
