import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, it } from "node:test";
import { runCli } from "../src/cli.js";
import type { ScanResult } from "../src/types.js";

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "pathport-cli-"));
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

function createIoCapture() {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: {
      stdout: (text: string) => out.push(text),
      stderr: (text: string) => err.push(text),
    },
    out,
    err,
  };
}

describe("CLI runCli", () => {
  it("prints help and version with exit code 0", async () => {
    const helpCap = createIoCapture();
    const helpCode = await runCli(["--help"], helpCap.io);
    assert.equal(helpCode, 0);
    assert.ok(helpCap.out.join("\n").includes("Usage:"));

    const verCap = createIoCapture();
    const verCode = await runCli(["--version"], verCap.io);
    assert.equal(verCode, 0);
    assert.match(verCap.out.join("").trim(), /^\d+\.\d+\.\d+/);
  });

  it("scans a clean directory in text and json formats with exit code 0", async () => {
    const root = await makeTempDir();
    await writeFile(path.join(root, "readme.md"), "# hi\n", "utf8");

    const textCap = createIoCapture();
    const textCode = await runCli(["--path", root, "--format", "text"], textCap.io);
    assert.equal(textCode, 0);
    assert.ok(textCap.out.join("\n").includes("No cross-platform filename issues found."));

    const jsonCap = createIoCapture();
    const jsonCode = await runCli(["--path", root, "--format", "json"], jsonCap.io);
    assert.equal(jsonCode, 0);
    const parsed = JSON.parse(jsonCap.out.join("\n")) as ScanResult;
    assert.equal(parsed.schemaVersion, "1.0.0");
    assert.equal(parsed.summary.total, 0);
  });

  it("returns exit code 1 when findings meet --fail-on threshold and 0 when below", async () => {
    const root = await makeTempDir();
    // Create a deeply nested path >= 220 chars (works on all OSes including Windows)
    const nested = path.join(root, "a".repeat(60), "b".repeat(60), "c".repeat(60), "d".repeat(50));
    const { mkdir } = await import("node:fs/promises");
    await mkdir(nested, { recursive: true });
    await writeFile(path.join(nested, "file.txt"), "ok", "utf8");

    const warnFail = createIoCapture();
    assert.equal(
      await runCli(["--path", root, "--platform", "windows", "--fail-on", "warning"], warnFail.io),
      1,
    );

    const errPass = createIoCapture();
    assert.equal(
      await runCli(["--path", root, "--platform", "windows", "--fail-on", "error"], errPass.io),
      0,
    );

    const nonePass = createIoCapture();
    assert.equal(
      await runCli(["--path", root, "--platform", "windows", "--fail-on", "none"], nonePass.io),
      0,
    );
  });

  it("returns exit code 2 for invalid arguments or missing path", async () => {
    const badFlag = createIoCapture();
    assert.equal(await runCli(["--unknown-flag"], badFlag.io), 2);

    const badPlatform = createIoCapture();
    assert.equal(await runCli(["--platform", "plan9"], badPlatform.io), 2);

    const badFormat = createIoCapture();
    assert.equal(await runCli(["--format", "xml"], badFormat.io), 2);

    const badFailOn = createIoCapture();
    assert.equal(await runCli(["--fail-on", "critical"], badFailOn.io), 2);

    const badDepth = createIoCapture();
    assert.equal(await runCli(["--max-depth", "abc"], badDepth.io), 2);

    const missingPath = createIoCapture();
    assert.equal(
      await runCli(["--path", path.join(os.tmpdir(), "nonexistent-pathport-xyz")], missingPath.io),
      2,
    );
  });

  it("runs end-to-end via bin/pathport.js", async () => {
    const binPath = path.resolve(process.cwd(), "bin", "pathport.js");
    const { stdout } = await execFileAsync(process.execPath, [binPath, "--version"]);
    assert.match(stdout.trim(), /^\d+\.\d+\.\d+/);
  });
});
