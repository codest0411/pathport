# PathPort

Local-first cross-platform filename compatibility checker for software repositories.

PathPort scans file and directory names in a repository and reports names, character sequences, collisions, path lengths, and symlink patterns that behave differently across **Windows**, **macOS**, and **Linux**.

**Read-only by design:** PathPort never renames, deletes, rewrites, or uploads scanned files, never executes repository scripts, and never makes network requests.

## Installation

```bash
npm install --save-dev pathport
```

Or run globally / via `npx`:

```bash
npx pathport --path .
```

Requires **Node.js >= 20.11.0**.

## Quick Start

Scan the current directory for all platforms (`windows`, `macos`, `linux`):

```bash
npx pathport
```

Scan a specific directory for Windows compatibility and output JSON for CI:

```bash
npx pathport --path ./my-repo --platform windows --format json
```

Fail CI on warnings as well as errors:

```bash
npx pathport --platform all --fail-on warning
```

## CLI Reference

```text
Usage:
  pathport [options]

Options:
  -p, --path <directory>         Directory to scan (default: ".")
      --platform <target>        Target platform: windows | macos | linux | all (default: "all")
  -f, --format <format>          Output format: text | json (default: "text")
      --fail-on <severity>       Exit 1 if findings meet/exceed: error | warning | info | none (default: "error")
      --exclude <pattern>        Exclude name, relative path, or simple prefix/suffix * glob (repeatable)
      --no-default-excludes      Do not exclude default directories (.git, node_modules)
      --max-depth <n>            Maximum directory traversal depth (positive integer)
      --max-diagnostics <n>      Maximum diagnostics to emit (default: 1000)
  -h, --help                     Show this help message
  -v, --version                  Show version number
```

### Exit Codes

- `0`: Scan completed with no findings at or above the `--fail-on` threshold.
- `1`: Scan completed and findings meet or exceed the `--fail-on` threshold.
- `2`: Invalid CLI arguments or operational error (such as a missing directory).

## Sample Output

### Text (`--format text`)

```text
PathPort scan: /path/to/repo
Target platform: all | Scanned: 42 entries (35 files, 7 dirs, 0 symlinks) | Skipped: 2

[ERROR  ] PP004 (case-insensitive-collision) [windows,macos]
  Path:        src/Utils.ts
  Related:     src/utils.ts
  Issue:       Case-insensitive collision between sibling entries: 'Utils.ts', 'utils.ts'.
  Why:         Default Windows (NTFS) and macOS (APFS/HFS+) filesystems are case-insensitive. Checking out or extracting these entries on those platforms can cause one file or directory to overwrite or shadow another.
  Remediation: Rename one of the colliding entries so all sibling names remain distinct when compared case-insensitively (use `git mv` with a temporary name if renaming on a case-insensitive host).

Summary: 1 finding(s) (1 error, 0 warning, 0 info) in 3.12ms.
Note: Filesystem behavior varies by OS, filesystem (NTFS/APFS/ext4), mount options, and Git config (e.g. core.ignorecase, core.precomposeUnicode).
```

### JSON (`--format json`)

JSON output uses `schemaVersion: "1.0.0"` with deterministic ordering (`severity`, then `path`, then `ruleId`) and includes `rootPath`, `platform`, `excludedPatterns`, `diagnostics`, `summary`, `stats`, and `errors`.

## Rule Reference

| Rule ID | Name                              | Default Severity                                          | Target Platforms            | Description                                                                                                    |
| ------- | --------------------------------- | --------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `PP001` | `windows-reserved-name`           | `error`                                                   | `windows`                   | Flags `CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`, including with extensions (`CON.txt`).         |
| `PP002` | `windows-trailing-dot-or-space`   | `error`                                                   | `windows`                   | Flags names ending in `.` or space (` `).                                                                      |
| `PP003` | `windows-invalid-char`            | `error`                                                   | `windows`                   | Flags `< > : " / \                                                                                             | ? *`and ASCII control chars`0x00`–`0x1F`. |
| `PP004` | `case-insensitive-collision`      | `error`                                                   | `windows`, `macos`          | Flags sibling entries in the same directory differing only by case.                                            |
| `PP005` | `unicode-normalization-collision` | `error`                                                   | `macos`                     | Flags sibling entries identical after Unicode NFC normalization but differing in raw code points (NFC vs NFD). |
| `PP006` | `git-case-collision-risk`         | `warning`                                                 | `linux`                     | Warns on `--platform linux` when sibling entries differ only by case (Git checkout risk on Windows/macOS).     |
| `PP007` | `macos-colon-character`           | `warning`                                                 | `macos`                     | Flags `:` in filenames, which macOS Finder disallows / maps in HFS+ layers.                                    |
| `PP008` | `control-character`               | `warning` (`error` for NUL)                               | `windows`, `macos`, `linux` | Flags ASCII control characters (`0x00`–`0x1F`, `0x7F`).                                                        |
| `PP009` | `path-length-limit`               | `error` (>255B segment) / `warning` (>=220 chars relpath) | `windows`, `macos`, `linux` | Flags >255-byte segments on all platforms and >=220-char relative paths on Windows/all.                        |
| `PP010` | `symlink-escapes-root`            | `warning`                                                 | `windows`, `macos`, `linux` | Flags symlinks resolving outside the scan root.                                                                |
| `PP011` | `symlink-loop-or-broken`          | `warning`                                                 | `windows`, `macos`, `linux` | Flags symlink loops (`ELOOP`) and dangling symlinks.                                                           |

## Programmatic API

```ts
import { scanRepository, formatTextReport } from "pathport";

const result = await scanRepository({
  rootPath: ".",
  platform: "all",
  exclude: ["dist"],
  maxDepth: 20,
});

console.log(formatTextReport(result));
```

## Limitations & Filesystem Nuances

- **OS & filesystem variation:** Filesystem semantics depend on OS, filesystem type (NTFS, FAT32, APFS, HFS+, ext4, XFS), mount options (e.g., case-sensitive APFS volumes or Windows per-directory case sensitivity), and Git configuration (`core.ignorecase`, `core.precomposeUnicode`, `core.longpaths`).
- **Host-dependent creation:** Some invalid names (such as `CON.txt` or `foo:bar` on Windows, or two case-only siblings on a default macOS/Windows disk) cannot even exist simultaneously on a case-insensitive host; running PathPort in Linux CI catches issues before Windows/macOS contributors pull them.
- **No automatic fixes:** PathPort intentionally does not rename or modify files.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
