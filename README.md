# codeigniter-mcp

![npm](https://img.shields.io/npm/v/codeigniter-mcp)
![npm downloads](https://img.shields.io/npm/dm/codeigniter-mcp)
![License: MIT](https://img.shields.io/github/license/X-Gunner/codeigniter-mcp)
![CI](https://img.shields.io/github/actions/workflow/status/X-Gunner/codeigniter-mcp/ci.yml?branch=main)
![Node](https://img.shields.io/badge/node-%3E%3D20.12-brightgreen)
![Tests](https://img.shields.io/badge/tests-154%2F154-brightgreen)
![SemVer](https://img.shields.io/badge/semver-2.0.0-blue)

**MCP (Model Context Protocol)** server that accelerates development of a PHP
framework inspired by CodeIgniter: **MVC + optional Services/Repository layer**
(lightweight Ports/Adapters), with **native CodeIgniter 4 support** (auto-
detected from the project structure). Extreme development speed without
sacrificing security.

> Version: `0.5.0` — Semantic versioning: any input/output schema change breaks
> compatibility and must be versioned explicitly.

## Highlights

- **7 tools** + **4 resources** + **3 token-saving prompts** for an LLM
  (Claude Code, Cursor, VS Code, Trae) to scaffold, validate and maintain
  idiomatic framework code without hallucinating structure.
- **CodeIgniter 4 native** — `BaseController` + Model (Query Builder) + forge
  migrations + views; auto-detected, zero config needed.
- **Hard security by default**: Zod input validation, path-traversal
  protection, explicit `confirm`/`overwrite` for destructive ops, rate
  limiting, prepared statements, no credential leaks.

## Quickstart

```bash
npx -y codeigniter-mcp          # run directly over stdio (published package)
npm install -g codeigniter-mcp  # or install globally
```

**From source** (contributors): `npm install && npm run build && npm test`.

## Configuration

The server reads environment variables (see `mcp.json`):

| Variable | Default | Description |
|---|---|---|
| `APP_ROOT` | — | **Required.** Absolute path to the target PHP framework root. All tools operate **only** inside this directory. |
| `RATE_LIMIT_PER_MINUTE` | `20` | Write operations allowed per minute per session. |
| `MCP_TRANSPORT` | `stdio` | `stdio` (local) or `http` (remote Streamable HTTP). |
| `MCP_PORT` | `3000` | HTTP transport port. |

**mcp.json** (Claude Code / Cursor / Trae):

```json
{
  "mcpServers": {
    "codeigniter-mcp": {
      "command": "npx",
      "args": ["-y", "codeigniter-mcp"],
      "env": {
        "APP_ROOT": "/path/to/mi-framework",
        "RATE_LIMIT_PER_MINUTE": "20"
      }
    }
  }
}
```

**Project profiles** (`.codeigniter-mcp.json` — optional): an explicit file
always wins; without it the profile is auto-detected from the project
structure (`app/Config/Paths.php` or `spark` → `ci4`; `bin/migrate` or
`app/Repositories` → `spec`; unknown → `spec`). See
[docs/profiles.md](docs/profiles.md).

## Tools

| Tool | What it does |
|---|---|
| `scaffold_full_resource` | Full CRUD: Controller + Service + Repository (interface+impl) + Entity + Migration + tests (8 files, ~15 ms) |
| `scaffold_controller` | Controller only; zero SQL allowed (build-time check) |
| `scaffold_service` | Service: business logic + validation, contract-first DI (ci4: Service that injects the Model) |
| `scaffold_repository` | Repository interface + PDO implementation, always together (ci4: no-op, Models handle data) |
| `validate_route` | Read-only route collision detection against `app/Config/Routes.php` |
| `run_migration` | Runs the native migration runner (spec: `bin/migrate`; ci4: `spark migrate`). Requires explicit `confirm`; failures are interpreted (no raw stack traces) |
| `lint_against_framework_rules` | Lints PHP files against the profile conventions |

## Prompts

Token-saving templates: compact input → exact tool arguments.

| Prompt | What it does |
|---|---|
| `create_full_resource` | `resource` + compact `fields` → exact `scaffold_full_resource` arguments |
| `run_migration` | `direction` + `confirm` → exact `run_migration` arguments |
| `lint_file` | `filePath` → exact `lint_against_framework_rules` arguments |

## Resources

| URI | Content |
|---|---|
| `convention://naming` | PascalCase / camelCase / kebab-case, mandatory suffixes |
| `convention://architecture` | MVC + Service + Repository (lightweight Ports/Adapters) |
| `convention://folder-structure` | Framework folder tree |
| `convention://security-rules` | Hard security rules of the tools |

## Docs

- [docs/tools.md](docs/tools.md) — full tool specs, inputs/outputs and examples
- [docs/profiles.md](docs/profiles.md) — profiles, `.codeigniter-mcp.json`, auto-detection, generated contract
- [docs/security.md](docs/security.md) — security model in detail
- [docs/testing.md](docs/testing.md) — tests, `npm run verify`, local development, end-to-end example

## Roadmap

- **`ci3` profile** — CodeIgniter 3 (legacy) support behind the same
  `.codeigniter-mcp.json` / auto-detection mechanism (CI3 is still active on a
  large legacy base but is EOL: no security patches).
- **Recipe prompts** — high-level feature templates (auth, file uploads,
  REST CRUD) that chain the existing tools.

## Contributing

Contributions are welcome! Read [CONTRIBUTING.md](CONTRIBUTING.md) to set up
the development environment, run the tests and open a pull request. Security
issues should be reported privately — see [SECURITY.md](SECURITY.md). Release
history is tracked in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE) © 2026 X-Gunner
