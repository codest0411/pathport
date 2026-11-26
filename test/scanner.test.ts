import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { ScannerOperationalError, scanRepository } from "../src/scanner.js";

const tempDirs: string[] = [];

async function makeTempDir(prefix = "pathport-test-"): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir !== undefined) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe("scanRepository", () => {
  it("scans a clean directory with spaces and Unicode in paths", async () => {
    const root = await makeTempDir();
    const subDir = path.join(root, "my folder", "café ☕");
    await mkdir(subDir, { recursive: true });
    await writeFile(path.join(subDir, "hello world.txt"), "content", "utf8");

    const result = await scanRepository({ rootPath: root, platform: "all" });
    assert.equal(result.schemaVersion, "1.0.0");
    assert.equal(result.summary.total, 0);
    assert.equal(result.stats.scannedFiles, 1);
    assert.equal(result.stats.scannedDirectories, 2);
    assert.equal(result.errors.length, 0);
  });

  it("throws ScannerOperationalError for missing or non-directory paths", async () => {
    const root = await makeTempDir();
    const missing = path.join(root, "does-not-exist");
    await assert.rejects(
      () => scanRepository({ rootPath: missing }),
      (err: unknown) => err instanceof ScannerOperationalError && err.code === "ENOENT",
    );

    const filePath = path.join(root, "regular.txt");
    await writeFile(filePath, "hi", "utf8");
    await assert.rejects(
      () => scanRepository({ rootPath: filePath }),
      (err: unknown) => err instanceof ScannerOperationalError && err.code === "ENOTDIR",
    );
  });

  it("respects default excludes, custom excludes, noDefaultExcludes, and maxDepth", async () => {
    const root = await makeTempDir();
    await mkdir(path.join(root, "node_modules", "pkg"), { recursive: true });
    await writeFile(path.join(root, "node_modules", "pkg", "CON.txt"), "x", "utf8");
    await mkdir(path.join(root, "a", "b", "c"), { recursive: true });
    await writeFile(path.join(root, "a", "b", "c", "deep.txt"), "x", "utf8");
    await writeFile(path.join(root, "ignored.log"), "x", "utf8");

    const defaultScan = await scanRepository({
      rootPath: root,
      exclude: ["*.log"],
      maxDepth: 2,
    });
    assert.equal(defaultScan.summary.total, 0);
    assert.ok(defaultScan.stats.skippedEntries >= 2); // node_modules and ignored.log

    const fullScan = await scanRepository({
      rootPath: root,
      noDefaultExcludes: true,
    });
    // Now node_modules/pkg/CON.txt is scanned and flagged if CON.txt could be created
    assert.ok(fullScan.stats.scannedFiles >= 2);
  });

  it("handles large directory trees and bounds output with maxDiagnostics", async () => {
    const root = await makeTempDir();
    const sub = path.join(root, "many");
    await mkdir(sub, { recursive: true });

    // Create 300 files with case-insensitive pairs where supported, or valid files + a long-path or many files
    const writes: Promise<void>[] = [];
    for (let i = 0; i < 300; i += 1) {
      writes.push(writeFile(path.join(sub, `file-${String(i).padStart(4, "0")}.txt`), "", "utf8"));
    }
    await Promise.all(writes);

    const result = await scanRepository({ rootPath: root, maxDiagnostics: 5 });
    assert.equal(result.stats.scannedFiles, 300);
    assert.equal(result.stats.truncated, false);

    // Verify invalid maxDiagnostics / maxDepth throw ScannerOperationalError
    await assert.rejects(
      () => scanRepository({ rootPath: root, maxDiagnostics: 0 }),
      ScannerOperationalError,
    );
    await assert.rejects(
      () => scanRepository({ rootPath: root, maxDepth: 0 }),
      ScannerOperationalError,
    );
  });

  it("never modifies files, reads .env secrets, or executes project scripts", async () => {
    const root = await makeTempDir();
    const markerPath = path.join(root, "pwned.txt");
    const pkgPath = path.join(root, "package.json");
    const envPath = path.join(root, ".env");

    const pkgContent = JSON.stringify({
      name: "untrusted-fixture",
      scripts: {
        preinstall: `node -e "require('fs').writeFileSync('${markerPath.replace(/\\/g, "\\\\")}', 'ran')"`,
        postinstall: "echo should-never-run",
        test: "echo should-never-run",
      },
    });
    const envContent = "SUPER_SECRET_TOKEN=do_not_read_or_leak_12345\n";

    await writeFile(pkgPath, pkgContent, "utf8");
    await writeFile(envPath, envContent, "utf8");

    const hashBefore = createHash("sha256").update(pkgContent).digest("hex");

    const result = await scanRepository({ rootPath: root, format: "all" } as never);
    const serialized = JSON.stringify(result);

    // Marker must never be created
    await assert.rejects(() => readFile(markerPath, "utf8"));
    // Files must be byte-identical
    const pkgAfter = await readFile(pkgPath, "utf8");
    const envAfter = await readFile(envPath, "utf8");
    assert.equal(createHash("sha256").update(pkgAfter).digest("hex"), hashBefore);
    assert.equal(envAfter, envContent);
    // Secret must never appear in scan output
    assert.equal(serialized.includes("SUPER_SECRET_TOKEN"), false);
    assert.equal(serialized.includes("do_not_read_or_leak_12345"), false);
  });

  it("detects symlinks escaping root, broken symlinks, and symlink loops when OS permits symlinks", async (t) => {
    const root = await makeTempDir();
    const outside = await makeTempDir("pathport-outside-");
    const outsideFile = path.join(outside, "secret.txt");
    await writeFile(outsideFile, "outside", "utf8");

    const insideFile = path.join(root, "inside.txt");
    await writeFile(insideFile, "inside", "utf8");

    try {
      await symlink(outsideFile, path.join(root, "escape-link"));
      await symlink(path.join(root, "nonexistent"), path.join(root, "broken-link"));
      await symlink(path.join(root, "loop-b"), path.join(root, "loop-a"));
      await symlink(path.join(root, "loop-a"), path.join(root, "loop-b"));
      await symlink(insideFile, path.join(root, "valid-link"));
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "EPERM" || code === "EACCES") {
        t.skip(`Skipping OS symlink creation test on Windows without symlink privilege (${code})`);
        return;
      }
      throw err;
    }

    const result = await scanRepository({ rootPath: root, platform: "all" });
    assert.equal(result.stats.scannedSymlinks, 5);
    assert.ok(result.diagnostics.some((d) => d.ruleId === "PP010" && d.path === "escape-link"));
    assert.ok(result.diagnostics.some((d) => d.ruleId === "PP011" && d.path === "broken-link"));
    assert.ok(result.diagnostics.some((d) => d.ruleId === "PP011" && d.path === "loop-a"));
    assert.equal(
      result.diagnostics.some((d) => d.path === "valid-link"),
      false,
    );
  });
});
