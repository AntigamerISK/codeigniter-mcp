# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
