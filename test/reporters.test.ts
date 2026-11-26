import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatJsonReport } from "../src/reporters/json.js";
import { formatTextReport } from "../src/reporters/text.js";
import type { ScanResult } from "../src/types.js";

const SAMPLE_RESULT: ScanResult = {
  schemaVersion: "1.0.0",
  rootPath: "/tmp/repo",
  platform: "all",
  excludedPatterns: [".git", "node_modules"],
  diagnostics: [
    {
      ruleId: "PP004",
      ruleName: "case-insensitive-collision",
      severity: "error",
      platforms: ["windows", "macos"],
      path: "src/App.ts",
      relatedPaths: ["src/app.ts"],
      message: "Case-insensitive collision between sibling entries: 'App.ts', 'app.ts'.",
      explanation: "Default Windows and macOS filesystems are case-insensitive.",
      remediation: "Rename one of the colliding entries.",
    },
  ],
  summary: { total: 1, error: 1, warning: 0, info: 0 },
  stats: {
    scannedEntries: 10,
    scannedFiles: 8,
    scannedDirectories: 2,
    scannedSymlinks: 0,
    skippedEntries: 1,
    truncated: true,
    durationMs: 4.2,
  },
  errors: [{ path: "restricted", code: "EACCES", message: "permission denied" }],
};

describe("reporters", () => {
  it("formats human-readable text report with findings, errors, and truncation notice", () => {
    const text = formatTextReport(SAMPLE_RESULT);
    assert.ok(text.includes("PathPort scan: /tmp/repo"));
    assert.ok(text.includes("[ERROR  ] PP004 (case-insensitive-collision)"));
    assert.ok(text.includes("Related:     src/app.ts"));
    assert.ok(text.includes("Operational errors during scan:"));
    assert.ok(text.includes("Output was truncated to 1 diagnostics"));
    assert.ok(text.includes("Summary: 1 finding(s) (1 error, 0 warning, 0 info)"));
  });

  it("formats clean text report when diagnostics are empty", () => {
    const clean: ScanResult = {
      ...SAMPLE_RESULT,
      diagnostics: [],
      summary: { total: 0, error: 0, warning: 0, info: 0 },
      stats: { ...SAMPLE_RESULT.stats, truncated: false },
      errors: [],
    };
    const text = formatTextReport(clean);
    assert.ok(text.includes("No cross-platform filename issues found."));
  });

  it("formats stable JSON output", () => {
    const json = formatJsonReport(SAMPLE_RESULT);
    const parsed = JSON.parse(json) as ScanResult;
    assert.equal(parsed.schemaVersion, "1.0.0");
    assert.equal(parsed.diagnostics.length, 1);
    assert.equal(parsed.diagnostics[0]?.ruleId, "PP004");
  });
});
