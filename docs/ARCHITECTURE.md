# PathPort Architecture Guide

## Module Boundaries

PathPort is organized into four clean layers inside `src/`:

1. **`src/types.ts`** — Shared TypeScript interfaces (`ScannedEntry`, `Diagnostic`, `RuleDefinition`, `ScanOptions`, `ScanResult`).
2. **`src/scanner.ts`** — Read-only filesystem walker (`scanRepository`). Uses `lstat`, `readdir`, `readlink`, and `realpath` without ever reading file contents, executing scripts, or recursing into symlinks.
3. **`src/rules/`** — Pure rule evaluators operating on `ScannedEntry[]`:
   - `windows.ts`: `PP001`, `PP002`, `PP003`
   - `collisions.ts`: `PP004`, `PP005`, `PP006`
   - `paths.ts`: `PP007`, `PP008`, `PP009`
   - `symlinks.ts`: `PP010`, `PP011`
   - `index.ts`: `RULE_REGISTRY` and `evaluateRules`
4. **`src/reporters/` & `src/cli.ts`** — `formatTextReport`, `formatJsonReport`, and `runCli` (built on `node:util` `parseArgs`).

## How to Add a New Rule

1. **Choose the next stable ID** (e.g., `PP012`) and kebab-case `ruleName`.
2. **Add a `RuleDefinition`** to the appropriate module in `src/rules/` (or create a new file in `src/rules/` and export it from `src/rules/index.ts`).
3. **Implement the pure check function** taking `ScannedEntry` (for per-entry rules) or `readonly ScannedEntry[]` (for cross-entry rules). Keep it deterministic and platform-accurate—do not rely on host OS behavior.
4. **Include clear `explanation` and `remediation`** text in every `Diagnostic`, without overstating filesystem guarantees.
5. **Add unit tests** in `test/rules.test.ts` covering both positive and negative cases, plus target platform filtering.
6. **Document the rule** in `README.md` and `CHANGELOG.md`.
