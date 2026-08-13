# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-08-13

### Added

- **Framework auto-detection**: when `.codeigniter-mcp.json` is missing, the
  server now infers the profile from the project structure at APP_ROOT:
  - `app/Config/Paths.php` or the `spark` runner → `ci4`.
  - `bin/migrate` or `app/Repositories` → `spec`.
  - Unknown structure → `spec` (default).
- The explicit `.codeigniter-mcp.json` always wins over auto-detection (same
  precedence as before: explicit file > structure detection > spec default).
- 6 new tests covering `detectFramework` and the loader fallback (136 tests total).

## [0.2.0] - 2026-08-13

### Added

- **Project profiles** via an optional `.codeigniter-mcp.json` at APP_ROOT:
  - `framework: "spec"` (default) — the built-in CodeIgniter-style contract.
  - `framework: "ci4"` — **CodeIgniter 4 native** generation: `BaseController`
    + Model (Query Builder) + forge migrations + views; `php spark migrate`;
    snake_case allowed; `strict_types` not required.
- Optional `methodCase` and `requireStrictTypes` overrides in the file.
- `ci4` profile adapts the tools: `scaffold_full_resource` (Controller, Model,
  Migration, View), `scaffold_service` → Model, `scaffold_repository` → no-op,
  `lint` rules per profile, `run_migration` → `php spark migrate`.
- `npm run verify` — end-to-end acceptance checklist (`scripts/verify-mcp.mjs`)
  that tests the server against a throwaway framework and reports ✅/❌ per
  criterion.
- 16 new tests covering the conventions loader, ci4 templates, lint and
  scaffold (130 tests total).

### Changed

- Security tooling: Dependabot, CodeQL and `npm audit --audit-level=high` in CI.

## [0.1.2] - 2026-08-13

### Fixed

- The server now reports its version from `package.json` (`serverInfo`), so it
  always matches the published package version instead of a hardcoded string.

## [0.1.1] - 2026-08-13

### Changed

- Require Node `>= 20.12` (CI matrix: Node 20/22/24; Node 18 is EOL and its
  runtime lacks `util.styleText` used by the test toolchain).
- Test helpers are now cross-platform (path separators via `path.join`), fixing
  the test suite on Linux CI.

## [0.1.0] - 2026-08-13

### Added

- MCP server with 7 tools:
  - `scaffold_full_resource` — generates the complete CRUD (Controller, Service, Repository + Interface, Entity, Migration and tests).
  - `scaffold_controller` — Controller-only generation with a hard no-SQL rule.
  - `scaffold_service` — Service with business logic and input validation (contract first).
  - `scaffold_repository` — Repository interface + PDO implementation (always together).
  - `validate_route` — read-only route collision detection against `app/Config/Routes.php`.
  - `run_migration` — runs the framework's native migration runner (requires explicit `confirm`).
  - `lint_against_framework_rules` — lints PHP files against framework conventions.
- 4 `convention://` resources documenting naming, architecture, folder structure and security rules.
- stdio transport (default) and Streamable HTTP transport.
- Zod input validation, token-bucket rate limiting and path-traversal protection (`resolveInAppRoot`).
- Destructive operations guarded by explicit `confirm` / `overwrite` flags.
- PHP scaffolding templates with `declare(strict_types=1)`, PSR-4 and PDO prepared statements.
- 114 unit, integration and e2e tests.
