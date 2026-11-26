# Competitor & Ecosystem Research

- **Research Date:** 2026-11-26
- **Package Name Checked:** `pathport` (`npm view pathport` returned HTTP 404 — available on npm).

## Closest Alternatives Found

| Tool / Package                                                                                                                                              | Ecosystem / Version    | License      | Capabilities                                                                     | Gaps vs. PathPort                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `valid-filename` ([npm](https://www.npmjs.com/package/valid-filename), [GitHub](https://github.com/sindresorhus/valid-filename))                            | npm `5.0.0`            | MIT          | Validates whether a single filename string is valid across OSes.                 | String-only predicate (`boolean`); does not scan repositories, detect directory-level case/Unicode collisions, inspect symlinks, or emit structured CI diagnostics.          |
| `filename-reserved-regex` ([npm](https://www.npmjs.com/package/filename-reserved-regex), [GitHub](https://github.com/sindresorhus/filename-reserved-regex)) | npm `4.1.0`            | MIT          | Exports regexes for reserved characters and Windows reserved device names.       | Low-level regex building block only; no CLI, scanner, collision detection, or remediation guidance.                                                                          |
| `sanitize-filename` ([npm](https://www.npmjs.com/package/sanitize-filename), [GitHub](https://github.com/parshap/node-sanitize-filename))                   | npm `1.6.5`            | WTFPL OR ISC | Strips/replaces unsafe characters in a single filename string.                   | Mutating sanitizer for user input strings, not a read-only repository compatibility linter.                                                                                  |
| `pre-commit-hooks` `check-case-conflict` ([GitHub](https://github.com/pre-commit/pre-commit-hooks))                                                         | Python / pre-commit    | MIT          | Detects files in a Git repo that would collide on a case-insensitive filesystem. | Requires Python / `pre-commit`; focuses only on case conflicts, not Windows device names, trailing dots/spaces, Unicode NFC/NFD collisions, path length, or symlink escapes. |
| GitHub Actions `case-sensitivity-checker` / custom `git ls-files` scripts                                                                                   | GitHub Actions / Shell | Various      | Checks Git-tracked files for case-only duplicates in CI.                         | CI-only or shell-dependent; misses non-case portability hazards and lacks a local cross-platform CLI + typed Node.js API.                                                    |

## PathPort Differentiator

PathPort combines **all** major cross-platform filename compatibility checks into a single **zero-runtime-dependency**, **read-only**, **local-first** Node.js CLI and typed programmatic API:

1. **Repository-wide + sibling-aware:** Checks both per-entry rules (`PP001`–`PP003`, `PP007`–`PP011`) and directory-level sibling collisions (`PP004` case-insensitive, `PP005` Unicode NFC/NFD, `PP006` Git case-collision risk).
2. **Platform-targeted:** Supports `--platform windows|macos|linux|all` without assuming the host OS matches the target OS.
3. **CI-ready diagnostics:** Stable rule IDs (`PP001`–`PP011`), severity levels (`error`, `warning`, `info`), `--fail-on` thresholds, deterministic JSON (`schemaVersion: "1.0.0"`), and actionable remediation guidance.

## Authoritative References

- Microsoft Learn — _Naming Files, Paths, and Namespaces_: https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file
- Apple Developer / APFS & HFS+ Unicode normalization behavior (`core.precomposeUnicode` in Git): https://git-scm.com/docs/git-config#Documentation/git-config.txt-coreprecomposeUnicode
- Node.js `fs`, `path`, `node:util` (`parseArgs`), and `node:test` documentation: https://nodejs.org/api/
