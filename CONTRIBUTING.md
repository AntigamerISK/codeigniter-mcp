# Contributing to codeigniter-mcp

Thanks for taking the time to contribute! This project follows a few simple rules
to keep the codebase consistent and the release process predictable.

## Development setup

```bash
npm install
npm run build     # compiles TypeScript → dist/
npm test          # full suite (unit + integration + e2e)
npm run typecheck # tsc --noEmit over src + tests
```

## Environment variables for local development

The server needs an `APP_ROOT` pointing to a target PHP framework root:

```bash
APP_ROOT=/path/to/mi-framework npm run dev
```

## How to contribute

1. Fork the repository and create your branch from `main`:
   `git checkout -b feat/my-feature`.
2. Make your changes. Follow the conventions of the existing code.
3. Add or update tests. Every tool must keep its unit/integration/e2e coverage.
4. Run the full suite and the typechecker; they must pass.
5. Commit with a descriptive message following
   [Conventional Commits](https://www.conventionalcommits.org/):
   `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
6. Open a Pull Request against `main` and describe the motivation and the change.

## Coding conventions

- TypeScript, strict mode, ESM (`import` / `export`).
- All user-facing messages in **English**.
- Every tool input must be validated with a Zod schema in `src/schemas/`.
- Tools return deterministic structured results; they never throw exceptions
  that break the MCP session.
- Destructive operations always require an explicit `confirm`/`overwrite` flag.
- Filesystem access only inside `APP_ROOT` (use `resolveInAppRoot`).

## Semantic versioning

- Any input/output schema change is a **breaking change** (major version bump).
- New backward-compatible tools or resources are minor bumps.
- Bug fixes and internal refactors are patch bumps.
