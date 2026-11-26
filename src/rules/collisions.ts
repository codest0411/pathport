import type { Diagnostic, Platform, RuleDefinition, ScannedEntry } from "../types.js";

export const COLLISION_RULES: readonly RuleDefinition[] = [
  {
    id: "PP004",
    name: "case-insensitive-collision",
    defaultSeverity: "error",
    platforms: ["windows", "macos"],
    description:
      "Flags sibling entries in the same directory whose names differ only by letter case.",
  },
  {
    id: "PP005",
    name: "unicode-normalization-collision",
    defaultSeverity: "error",
    platforms: ["macos"],
    description:
      "Flags sibling entries in the same directory whose names are identical after Unicode NFC normalization but differ in raw code points (e.g., NFC vs NFD).",
  },
  {
    id: "PP006",
    name: "git-case-collision-risk",
    defaultSeverity: "warning",
    platforms: ["linux"],
    description:
      "Warns on Linux targets when sibling entries differ only by case, creating Git checkout risks on Windows or macOS.",
  },
];

export function checkDirectoryCollisions(
  entries: readonly ScannedEntry[],
  platform: Platform,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  // Group entries by parent directory so we only compare siblings.
  const byParent = new Map<string, ScannedEntry[]>();
  for (const entry of entries) {
    const list = byParent.get(entry.parentRelativePath);
    if (list !== undefined) {
      list.push(entry);
    } else {
      byParent.set(entry.parentRelativePath, [entry]);
    }
  }

  const checkCaseAsError = platform === "all" || platform === "windows" || platform === "macos";
  const checkCaseAsGitWarning = platform === "linux";
  const checkUnicodeNorm = platform === "all" || platform === "macos";

  for (const siblings of byParent.values()) {
    if (siblings.length < 2) {
      continue;
    }

    // 1. Case-insensitive collision detection (within same directory).
    const caseGroups = new Map<string, ScannedEntry[]>();
    for (const entry of siblings) {
      const folded = entry.name.toLowerCase();
      const group = caseGroups.get(folded);
      if (group !== undefined) {
        group.push(entry);
      } else {
        caseGroups.set(folded, [entry]);
      }
    }

    for (const group of caseGroups.values()) {
      if (group.length < 2) {
        continue;
      }
      // Verify they are not already identical strings (impossible in one POSIX dir, possible only if synthetic)
      const uniqueNames = new Set(group.map((e) => e.name));
      if (uniqueNames.size < 2) {
        continue;
      }
      const sorted = [...group].sort((a, b) =>
        a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0,
      );
      const primary = sorted[0];
      if (primary === undefined) {
        continue;
      }
      const others = sorted.slice(1).map((e) => e.relativePath);
      const allNames = sorted.map((e) => `'${e.name}'`).join(", ");

      if (checkCaseAsError) {
        const platforms =
          platform === "windows"
            ? (["windows"] as const)
            : platform === "macos"
              ? (["macos"] as const)
              : (["windows", "macos"] as const);
        diagnostics.push({
          ruleId: "PP004",
          ruleName: "case-insensitive-collision",
          severity: "error",
          platforms,
          path: primary.relativePath,
          relatedPaths: others,
          message: `Case-insensitive collision between sibling entries: ${allNames}.`,
          explanation:
            "Default Windows (NTFS) and macOS (APFS/HFS+) filesystems are case-insensitive. Checking out or extracting these entries on those platforms can cause one file or directory to overwrite or shadow another.",
          remediation:
            "Rename one of the colliding entries so all sibling names remain distinct when compared case-insensitively (use `git mv` with a temporary name if renaming on a case-insensitive host).",
        });
      } else if (checkCaseAsGitWarning) {
        diagnostics.push({
          ruleId: "PP006",
          ruleName: "git-case-collision-risk",
          severity: "warning",
          platforms: ["linux"],
          path: primary.relativePath,
          relatedPaths: others,
          message: `Git cross-platform case-collision risk between sibling entries: ${allNames}.`,
          explanation:
            "While case-sensitive Linux filesystems (such as ext4) allow names differing only by case, cloning or checking out this repository via Git on default Windows or macOS filesystems will cause a case collision.",
          remediation:
            "If this repository may be cloned on Windows or macOS, rename one of the entries so they differ beyond letter case.",
        });
      }
    }

    // 2. Unicode NFC/NFD normalization collision detection.
    if (checkUnicodeNorm) {
      const normGroups = new Map<string, ScannedEntry[]>();
      for (const entry of siblings) {
        const normalized = entry.name.normalize("NFC");
        const group = normGroups.get(normalized);
        if (group !== undefined) {
          group.push(entry);
        } else {
          normGroups.set(normalized, [entry]);
        }
      }

      for (const group of normGroups.values()) {
        if (group.length < 2) {
          continue;
        }
        const uniqueRawNames = new Set(group.map((e) => e.name));
        if (uniqueRawNames.size < 2) {
          continue;
        }
        const sorted = [...group].sort((a, b) =>
          a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0,
        );
        const primary = sorted[0];
        if (primary === undefined) {
          continue;
        }
        const others = sorted.slice(1).map((e) => e.relativePath);
        diagnostics.push({
          ruleId: "PP005",
          ruleName: "unicode-normalization-collision",
          severity: "error",
          platforms: ["macos"],
          path: primary.relativePath,
          relatedPaths: others,
          message: `Unicode normalization collision (NFC/NFD) at '${primary.relativePath}' (${sorted.length} variants).`,
          explanation:
            "macOS APFS and HFS+ treat canonically equivalent Unicode sequences (such as precomposed NFC and decomposed NFD) as the same file on disk, whereas Linux ext4 treats them as distinct byte sequences.",
          remediation:
            "Consolidate to a single NFC-normalized filename and remove duplicate normalization variants.",
        });
      }
    }
  }

  return diagnostics;
}
