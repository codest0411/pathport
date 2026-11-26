import type { Diagnostic, Platform, RuleDefinition, ScannedEntry } from "../types.js";

/**
 * ASCII control characters (0x00-0x1F) and DEL (0x7F).
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/g;

/**
 * Conservative relative-path threshold for Windows legacy MAX_PATH (260 chars),
 * leaving room for a typical checkout prefix like "C:\Users\username\repos\project\".
 */
const WINDOWS_RELATIVE_PATH_WARN_LEN = 220;

/**
 * Standard single-component byte limit on Linux (ext4/XFS/Btrfs) and macOS (APFS),
 * and UTF-16 code unit limit (255) on Windows NTFS.
 */
const MAX_SEGMENT_BYTES = 255;

export const PATH_RULES: readonly RuleDefinition[] = [
  {
    id: "PP007",
    name: "macos-colon-character",
    defaultSeverity: "warning",
    platforms: ["macos"],
    description: "Flags colons (:) in names, which macOS Finder and HFS+ map/disallow.",
  },
  {
    id: "PP008",
    name: "control-character",
    defaultSeverity: "warning",
    platforms: ["windows", "macos", "linux"],
    description: "Flags ASCII control characters (0x00-0x1F, 0x7F) in file or directory names.",
  },
  {
    id: "PP009",
    name: "path-length-limit",
    defaultSeverity: "warning",
    platforms: ["windows", "macos", "linux"],
    description:
      "Flags path segments exceeding 255 bytes/code units and relative paths approaching Windows MAX_PATH (260 chars).",
  },
];

function formatCodePoint(ch: string): string {
  const code = ch.codePointAt(0) ?? 0;
  return `0x${code.toString(16).toUpperCase().padStart(2, "0")}`;
}

export function checkPathEntry(entry: ScannedEntry, platform: Platform): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const { name, relativePath } = entry;

  // PP007: macOS colon character (Windows already flags ':' via PP003, so emit PP007 for macos or all).
  if ((platform === "macos" || platform === "all") && name.includes(":")) {
    diagnostics.push({
      ruleId: "PP007",
      ruleName: "macos-colon-character",
      severity: "warning",
      platforms: ["macos"],
      path: relativePath,
      message: `Name '${name}' contains a colon (':'), which is problematic on macOS.`,
      explanation:
        "macOS Finder and Cocoa APIs disallow colons in filenames and map ':' to '/' in legacy HFS+/Carbon layers, causing confusing display or tool failures.",
      remediation: `Replace ':' in '${name}' with '-' or '_'.`,
    });
  }

  // PP008: ASCII control characters (0x00-0x1F, 0x7F).
  // Note: When platform is "windows", 0x00-0x1F is already flagged by PP003; we still flag 0x7F or non-windows platforms here.
  const controlMatches = name.match(CONTROL_CHAR_RE);
  if (controlMatches !== null && controlMatches.length > 0) {
    const filtered =
      platform === "windows"
        ? controlMatches.filter((c) => c.codePointAt(0) === 0x7f)
        : controlMatches;

    if (filtered.length > 0) {
      const hasNul = filtered.some((c) => c.codePointAt(0) === 0x00);
      const codes = [...new Set(filtered)].map(formatCodePoint).join(", ");
      diagnostics.push({
        ruleId: "PP008",
        ruleName: "control-character",
        severity: hasNul ? "error" : "warning",
        platforms: ["windows", "macos", "linux"],
        path: relativePath,
        message: `Name '${name}' contains ASCII control character(s): ${codes}.`,
        explanation:
          "Control characters such as newlines, tabs, ESC, or DEL break shell scripts, CI logs, and Git tooling, and NUL (0x00) is forbidden by POSIX and Windows kernels.",
        remediation: `Rename '${name}' to remove all control characters (${codes}).`,
      });
    }
  }

  // PP009: Segment length (> 255 bytes / UTF-16 code units) and Windows MAX_PATH warning.
  const utf8Bytes = Buffer.byteLength(name, "utf8");
  const utf16Units = name.length;
  if (utf8Bytes > MAX_SEGMENT_BYTES || utf16Units > MAX_SEGMENT_BYTES) {
    diagnostics.push({
      ruleId: "PP009",
      ruleName: "path-length-limit",
      severity: "error",
      platforms: ["windows", "macos", "linux"],
      path: relativePath,
      message: `Segment '${name}' exceeds 255-unit filesystem component limit (${utf8Bytes} UTF-8 bytes, ${utf16Units} UTF-16 units).`,
      explanation:
        "Most common filesystems (ext4, APFS, NTFS) enforce a 255-byte or 255-UTF-16-code-unit limit per individual filename or directory component.",
      remediation: "Shorten the file or directory name to well under 255 bytes.",
    });
  } else if (
    (platform === "windows" || platform === "all") &&
    relativePath.length >= WINDOWS_RELATIVE_PATH_WARN_LEN
  ) {
    diagnostics.push({
      ruleId: "PP009",
      ruleName: "path-length-limit",
      severity: "warning",
      platforms: ["windows"],
      path: relativePath,
      message: `Relative path length (${relativePath.length} chars) may exceed Windows legacy MAX_PATH (260 chars) after checkout.`,
      explanation:
        "Depending on the checkout directory prefix, Windows tools without LongPathsEnabled or Git without core.longpaths=true can fail when full paths reach 260 characters.",
      remediation:
        "Shorten deeply nested directory or file names so relative paths stay well below 220 characters.",
    });
  }

  return diagnostics;
}
