# Contributing to PathPort

Thank you for your interest in contributing to PathPort!

## Development Setup

```bash
git clone https://github.com/chirag-agrawal/pathport.git
cd pathport
npm ci
```

## Useful Scripts

- `npm run build` — Compile `src/` TypeScript to `dist/`
- `npm run typecheck` — Typecheck both `src/` and `test/`
- `npm run lint` — Run ESLint across the repository
- `npm run format:check` — Check Prettier formatting
- `npm test` — Run the `node:test` unit and integration suite
- `npm run test:coverage` — Run tests with Node's built-in coverage report

## Safety & Design Principles

1. **Zero runtime dependencies:** Keep `dependencies` empty; use Node.js built-ins.
2. **Read-only guarantee:** Never modify scanned files, execute project scripts, or read sensitive file contents (e.g., `.env`).
3. **Accurate platform claims:** Do not overstate portability guarantees; distinguish definite errors from heuristic warnings.
4. **Tests required:** Every new rule or CLI option must include positive and negative tests.

## Adding a Rule

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for a step-by-step guide to adding a rule with a stable `PP###` ID.
