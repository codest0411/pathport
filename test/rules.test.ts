import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateRules, RULE_REGISTRY } from "../src/rules/index.js";
import type { ScannedEntry } from "../src/types.js";

function entry(
  name: string,
  parentRelativePath = "",
  extra: Partial<ScannedEntry> = {},
): ScannedEntry {
  const relativePath = parentRelativePath === "" ? name : `${parentRelativePath}/${name}`;
  return {
    name,
    relativePath,
    parentRelativePath,
    kind: "file",
    depth: parentRelativePath === "" ? 1 : parentRelativePath.split("/").length + 1,
    ...extra,
  };
}

describe("RULE_REGISTRY", () => {
  it("contains unique stable rule IDs PP001 through PP011", () => {
    const ids = RULE_REGISTRY.map((r) => r.id);
    assert.deepEqual(ids, [
      "PP001",
      "PP002",
      "PP003",
      "PP004",
      "PP005",
      "PP006",
      "PP007",
      "PP008",
      "PP009",
      "PP010",
      "PP011",
    ]);
    assert.equal(new Set(RULE_REGISTRY.map((r) => r.name)).size, RULE_REGISTRY.length);
  });
});

describe("PP001: windows-reserved-name", () => {
  it("flags reserved device names and reserved names with extensions", () => {
    const reserved = [
      "CON",
      "prn",
      "Aux",
      "NUL",
      "COM1",
      "com9",
      "LPT1",
      "lpt9",
      "con.txt",
      "NUL.tar.gz",
    ];
    for (const name of reserved) {
      const diags = evaluateRules([entry(name)], "windows");
      assert.ok(
        diags.some((d) => d.ruleId === "PP001" && d.severity === "error"),
        `Expected PP001 for ${name}`,
      );
    }
  });

  it("does not flag non-reserved similar names or on linux/macos targets", () => {
    const safe = [
      "console.log",
      "con2.txt",
      "my_nul.txt",
      "com0.txt",
      "lpt10.txt",
      "prn_helper.ts",
    ];
    for (const name of safe) {
      const diags = evaluateRules([entry(name)], "windows");
      assert.equal(
        diags.filter((d) => d.ruleId === "PP001").length,
        0,
        `Did not expect PP001 for ${name}`,
      );
    }
    assert.equal(evaluateRules([entry("CON.txt")], "linux").length, 0);
    assert.equal(evaluateRules([entry("CON.txt")], "macos").length, 0);
  });
});

describe("PP002: windows-trailing-dot-or-space", () => {
  it("flags names ending in a dot or space", () => {
    for (const name of ["file.", "dir ", "notes. "]) {
      const diags = evaluateRules([entry(name)], "windows");
      assert.ok(
        diags.some((d) => d.ruleId === "PP002" && d.severity === "error"),
        `Expected PP002 for '${name}'`,
      );
    }
  });

  it("does not flag leading dots, internal dots, or internal spaces", () => {
    for (const name of [".gitignore", "my file.txt", "v1.2.3.tar.gz"]) {
      const diags = evaluateRules([entry(name)], "windows");
      assert.equal(diags.filter((d) => d.ruleId === "PP002").length, 0);
    }
  });
});

describe("PP003: windows-invalid-char", () => {
  it("flags Windows-forbidden characters", () => {
    const badNames = [
      "a<b.txt",
      "a>b.txt",
      "a:b.txt",
      'a"b.txt',
      "a\\b.txt",
      "a|b.txt",
      "a?b.txt",
      "a*b.txt",
      "a\x01b.txt",
    ];
    for (const name of badNames) {
      const diags = evaluateRules([entry(name)], "windows");
      assert.ok(
        diags.some((d) => d.ruleId === "PP003" && d.severity === "error"),
        `Expected PP003 for '${name}'`,
      );
    }
  });

  it("does not flag standard portable characters", () => {
    const diags = evaluateRules([entry("valid-file_name.v2+test.ts")], "windows");
    assert.equal(diags.length, 0);
  });
});

describe("PP004 & PP006: case-insensitive-collision and git-case-collision-risk", () => {
  it("flags sibling case collisions as PP004 error on windows, macos, and all", () => {
    const entries = [entry("Readme.md", "docs"), entry("readme.md", "docs")];
    for (const platform of ["windows", "macos", "all"] as const) {
      const diags = evaluateRules(entries, platform);
      const pp004 = diags.filter((d) => d.ruleId === "PP004");
      assert.equal(pp004.length, 1);
      assert.equal(pp004[0]?.severity, "error");
      assert.deepEqual(pp004[0]?.relatedPaths, ["docs/readme.md"]);
    }
  });

  it("flags sibling case collisions as PP006 warning on linux", () => {
    const entries = [entry("Readme.md", "docs"), entry("readme.md", "docs")];
    const diags = evaluateRules(entries, "linux");
    assert.equal(diags.filter((d) => d.ruleId === "PP004").length, 0);
    const pp006 = diags.filter((d) => d.ruleId === "PP006");
    assert.equal(pp006.length, 1);
    assert.equal(pp006[0]?.severity, "warning");
  });

  it("does not flag same names in different directories", () => {
    const entries = [entry("Index.ts", "src/a"), entry("index.ts", "src/b")];
    assert.equal(evaluateRules(entries, "all").length, 0);
  });
});

describe("PP005: unicode-normalization-collision", () => {
  it("flags NFC vs NFD sibling collisions on macos and all", () => {
    const nfc = "caf\u00e9.txt";
    const nfd = "cafe\u0301.txt";
    const entries = [entry(nfc, "assets"), entry(nfd, "assets")];

    for (const platform of ["macos", "all"] as const) {
      const diags = evaluateRules(entries, platform);
      const pp005 = diags.filter((d) => d.ruleId === "PP005");
      assert.equal(pp005.length, 1);
      assert.equal(pp005[0]?.severity, "error");
    }

    // Not flagged as PP005 on linux-only or windows-only
    assert.equal(evaluateRules(entries, "linux").filter((d) => d.ruleId === "PP005").length, 0);
    assert.equal(evaluateRules(entries, "windows").filter((d) => d.ruleId === "PP005").length, 0);
  });
});

describe("PP007: macos-colon-character", () => {
  it("flags colon in name on macos and all, but not linux", () => {
    const diagsMac = evaluateRules([entry("time:12.log")], "macos");
    assert.ok(diagsMac.some((d) => d.ruleId === "PP007" && d.severity === "warning"));

    const diagsAll = evaluateRules([entry("time:12.log")], "all");
    assert.ok(diagsAll.some((d) => d.ruleId === "PP007"));

    const diagsLinux = evaluateRules([entry("time:12.log")], "linux");
    assert.equal(diagsLinux.filter((d) => d.ruleId === "PP007").length, 0);
  });
});

describe("PP008: control-character", () => {
  it("flags NUL as error and other control characters (including DEL 0x7F) as warning", () => {
    const nulDiags = evaluateRules([entry("bad\x00file.txt")], "linux");
    assert.ok(nulDiags.some((d) => d.ruleId === "PP008" && d.severity === "error"));

    const tabDiags = evaluateRules([entry("bad\tfile.txt")], "linux");
    assert.ok(tabDiags.some((d) => d.ruleId === "PP008" && d.severity === "warning"));

    const delDiags = evaluateRules([entry("bad\x7ffile.txt")], "windows");
    assert.ok(delDiags.some((d) => d.ruleId === "PP008" && d.severity === "warning"));
  });
});

describe("PP009: path-length-limit", () => {
  it("flags single segments over 255 bytes as error on all platforms", () => {
    const longName = "a".repeat(256);
    const diags = evaluateRules([entry(longName)], "linux");
    assert.ok(diags.some((d) => d.ruleId === "PP009" && d.severity === "error"));
  });

  it("flags long relative paths (>= 220 chars) on windows and all as warning", () => {
    const parent = `${"dir/".repeat(55)}sub`; // > 220 chars
    const diagsWin = evaluateRules([entry("file.txt", parent)], "windows");
    assert.ok(diagsWin.some((d) => d.ruleId === "PP009" && d.severity === "warning"));

    const diagsLinux = evaluateRules([entry("file.txt", parent)], "linux");
    assert.equal(diagsLinux.filter((d) => d.ruleId === "PP009").length, 0);
  });
});

describe("PP010 & PP011: symlink rules", () => {
  it("flags symlinks escaping the scan root (PP010)", () => {
    const sym = entry("escape", "", {
      kind: "symlink",
      symlinkTarget: "../../etc/passwd",
      symlinkEscapesRoot: true,
    });
    const diags = evaluateRules([sym], "all");
    assert.ok(diags.some((d) => d.ruleId === "PP010" && d.severity === "warning"));
  });

  it("flags symlink loops and broken symlinks (PP011)", () => {
    const loopSym = entry("loop", "", {
      kind: "symlink",
      symlinkTarget: "loop",
      symlinkLoop: true,
    });
    const brokenSym = entry("broken", "", {
      kind: "symlink",
      symlinkTarget: "missing.txt",
      symlinkBroken: true,
    });
    const okSym = entry("ok", "", {
      kind: "symlink",
      symlinkTarget: "target.txt",
      symlinkEscapesRoot: false,
      symlinkLoop: false,
      symlinkBroken: false,
    });

    assert.ok(evaluateRules([loopSym], "all").some((d) => d.ruleId === "PP011"));
    assert.ok(evaluateRules([brokenSym], "all").some((d) => d.ruleId === "PP011"));
    assert.equal(evaluateRules([okSym], "all").length, 0);
  });
});
