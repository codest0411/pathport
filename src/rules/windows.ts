import type { Diagnostic, RuleDefinition, ScannedEntry } from "../types.js";

/**
 * Windows Win32 reserved device names (case-insensitive, also reserved with any extension).
 * Reference: Microsoft Learn "Naming Files, Paths, and Namespaces".
 */
const WINDOWS_RESERVED_NAME_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * Characters forbidden in Windows Win32 filenames: < > : " / \ | ? * and ASCII 0x00-0x1F.
 */
// eslint-disable-next-line no-control-regex
const WINDOWS_INVALID_CHAR_RE = /[<>:"/\\|?*\x00-\x1f]/g;

export const WINDOWS_RULES: readonly RuleDefinition[] = [
  {
    id: "PP001",
    name: "windows-reserved-name",
    defaultSeverity: "error",
    platforms: ["windows"],
    description:
      "Flags Windows Win32 reserved device names (CON, PRN, AUX, NUL, COM1-COM9, LPT1-LPT9), including names with extensions.",
  },
  {
    id: "PP002",
    name: "windows-trailing-dot-or-space",
    defaultSeverity: "error",
    platforms: ["windows"],
    description: "Flags file or directory names ending with a trailing dot (.) or space ( ).",
  },
  {
    id: "PP003",
    name: "windows-invalid-char",
    defaultSeverity: "error",
    platforms: ["windows"],
    description:
      'Flags characters forbidden in Windows Win32 filenames (< > : " / \\ | ? * and ASCII control characters 0x00-0x1F).',
  },
];

function formatControlOrChar(ch: string): string {
  const code = ch.codePointAt(0);
  if (code !== undefined && (code < 0x20 || code === 0x7f)) {
    return `0x${code.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return `'${ch}'`;
}

export function checkWindowsEntry(entry: ScannedEntry): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { name, relativePath } = entry;

  if (WINDOWS_RESERVED_NAME_RE.test(name)) {
    diagnostics.push({
      ruleId: "PP001",
      ruleName: "windows-reserved-name",
      severity: "error",
      platforms: ["windows"],
      path: relativePath,
      message: `Name '${name}' is a Windows reserved device name.`,
      explanation:
        "Standard Windows Win32 APIs, Explorer, and many tools intercept CON, PRN, AUX, NUL, COM1-COM9, and LPT1-LPT9 (with or without extensions) as hardware device names rather than regular files.",
      remediation: `Rename '${name}' to a non-reserved name (for example, prefix or suffix it, such as '${name}_file').`,
    });
  }

  if (name.endsWith(".") || name.endsWith(" ")) {
    const trailingKind = name.endsWith(".") ? "dot ('.')" : "space (' ')";
    diagnostics.push({
      ruleId: "PP002",
      ruleName: "windows-trailing-dot-or-space",
      severity: "error",
      platforms: ["windows"],
      path: relativePath,
      message: `Name '${name}' ends with a trailing ${trailingKind}.`,
      explanation:
        "Windows Win32 path normalization strips trailing spaces and periods from filenames, which can make files inaccessible, un-deletable, or collide with sibling names.",
      remediation: `Remove the trailing ${trailingKind} from '${name}'.`,
    });
  }

  const invalidMatches = name.match(WINDOWS_INVALID_CHAR_RE);
  if (invalidMatches !== null && invalidMatches.length > 0) {
    const uniqueChars = [...new Set(invalidMatches)].map(formatControlOrChar).join(", ");
    diagnostics.push({
      ruleId: "PP003",
      ruleName: "windows-invalid-char",
      severity: "error",
      platforms: ["windows"],
      path: relativePath,
      message: `Name '${name}' contains Windows-forbidden character(s): ${uniqueChars}.`,
      explanation:
        'Windows Win32 APIs forbid < > : " / \\ | ? * and ASCII control characters (0x00-0x1F) in file and directory names. Git checkouts and archive extractions on Windows can fail on these paths.',
      remediation: `Replace or remove the forbidden character(s) (${uniqueChars}) in '${name}'.`,
    });
  }

  return diagnostics;
}
