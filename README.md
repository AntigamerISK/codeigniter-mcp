# codeigniter-mcp

![npm](https://img.shields.io/npm/v/codeigniter-mcp)
![npm downloads](https://img.shields.io/npm/dm/codeigniter-mcp)
![License: MIT](https://img.shields.io/github/license/X-Gunner/codeigniter-mcp)
![CI](https://img.shields.io/github/actions/workflow/status/X-Gunner/codeigniter-mcp/ci.yml?branch=main)
![Node](https://img.shields.io/badge/node-%3E%3D20.12-brightgreen)
![Tests](https://img.shields.io/badge/tests-136%2F136-brightgreen)
![SemVer](https://img.shields.io/badge/semver-2.0.0-blue)

**MCP (Model Context Protocol)** server that accelerates the development of a
PHP framework inspired by CodeIgniter: **MVC + optional Services/Repository
layer** (lightweight Ports/Adapters). Its goal is **extreme development speed
without sacrificing security**.

The server exposes 7 tools and 4 resources that allow an LLM (Claude Code,
Cursor, VS Code, etc.) to **generate, validate and maintain idiomatic framework
code without friction** and without structure hallucinations.

Published on [npm](https://www.npmjs.com/package/codeigniter-mcp) — run it with
`npx codeigniter-mcp`, no build required.

> Version: `0.3.0` — Semantic versioning: any input/output schema change breaks
> compatibility and must be versioned explicitly.

---

## Table of Contents

1. [Requirements](#requirements)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Usage in MCP clients](#usage-in-mcp-clients)
5. [Tools](#tools)
6. [Resources](#resources)
7. [Generated PHP framework contract](#generated-php-framework-contract)
8. [Security model](#security-model)
9. [Testing](#testing)
10. [Local development](#local-development)
11. [End-to-end example](#end-to-end-example)
12. [FAQ](#faq)
13. [Contributing](#contributing)
14. [License](#license)

---

## Requirements

| Dependency | Version | Notes |
|---|---|---|
| Node.js | >= 20.12 | MCP server runtime + tooling (tested on Node 24) |
| npm | >= 9 | Package manager |
| PHP | 8.2+ | Only to **run** the generated code (not to run the MCP server) |
| Composer / PHPUnit | — | For the generated PHP tests |

---

## Installation

**Quick start** (published package — no build needed):

```bash
npx -y codeigniter-mcp          # run directly over stdio
npm install -g codeigniter-mcp  # or install globally
```

**From source** (for contributors):

```bash
npm install
npm run build   # compiles TypeScript → dist/
npm test        # full suite (unit + integration + e2e)
```

---

## Configuration

The server is configured through environment variables (see `mcp.json`):

| Variable | Default | Description |
|---|---|---|
| `APP_ROOT` | — | **Required.** Absolute path to the target PHP framework root. All tools operate **only** inside this directory. |
| `RATE_LIMIT_PER_MINUTE` | `20` | Write operations allowed per minute per session. |
| `MCP_TRANSPORT` | `stdio` | `stdio` (local) or `http` (remote Streamable HTTP). |
| `MCP_PORT` | `3000` | HTTP transport port. |

### mcp.json (Claude Code / Cursor)

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

> Uses the published package — no build required; `npx` downloads it on first
> run. Contributors can point the server at a local build instead:
> `"command": "node"` with `"args": ["dist/index.js"]`.
> The SDK 1.x stdio transport uses newline-delimited JSON messages
> (no `Content-Length`); official clients handle it automatically.

### Project profiles (`.codeigniter-mcp.json`)

An optional file at the project root tells the tools which framework to target:

```json
{ "framework": "ci4" }
```

| Profile | Behavior |
|---|---|
| `spec` (default) | The built-in CodeIgniter-style contract: Controller + Service + Repository + Entity + PDO + `bin/migrate` + camelCase. |
| `ci4` | **CodeIgniter 4 native**: `BaseController` + Model (Query Builder) + forge migrations + views; migrations run with `php spark migrate`; snake_case allowed; `strict_types` not required. |

Optional overrides: `methodCase` (`"camelCase"` | `"snake_case"`) and
`requireStrictTypes` (boolean). With `ci4`, `scaffold_full_resource` generates
Controller + Model + Migration + View, `scaffold_service` generates the Model,
and `scaffold_repository` is a no-op (CI4 uses Models).

**Auto-detection**: if the file is missing, the profile is inferred from the
project structure at APP_ROOT, so a native CI4 project works with zero config:

- `app/Config/Paths.php` or the `spark` runner → `ci4`
- `bin/migrate` or `app/Repositories` → `spec`
- Unknown structure → `spec` (default)

Precedence: explicit `.codeigniter-mcp.json` > structure detection > `spec`.

---

## Usage in MCP clients

**Claude Code**: add the `codeigniter-mcp` block above to your user or project
`mcp.json` (`npx` downloads the package automatically on first run), restart the
session, and ask something like:

> Generate the full CRUD of the `Product` resource with fields `title` (string,
> required, max:255), `price` (float) and `description` (text, optional).

**VS Code / Cursor**: register the same block in the MCP configuration.

**Remote deployment** (Streamable HTTP):

```bash
MCP_TRANSPORT=http MCP_PORT=3000 APP_ROOT=/path/to/mi-framework npx -y codeigniter-mcp
# or, from a local build:
# MCP_TRANSPORT=http MCP_PORT=3000 APP_ROOT=/path/to/mi-framework node dist/index.js
```

Clients connect to `http://localhost:3000/`.

---

## Tools

All tools return **deterministic structured output**:
`{ success: true, ... }` on success or `{ success: false, error: { type, message } }`
on failure. They never throw exceptions that break the MCP session.

### 1. `scaffold_full_resource`

Generates the complete CRUD of a resource.

**Input**

| Field | Type | Rules |
|---|---|---|
| `resourceName` | string | `PascalCase`, 2–40 chars |
| `fields[]` | array | `name` (camelCase), `type` (`string\|int\|float\|boolean\|date\|text`), `required` (bool), `validation` (optional, e.g. `"max:255\|email"`) |
| `withTests` | bool | Generates unit and integration tests (default `true`) |
| `withRepository` | bool | Generates repositories (default `true`) |
| `overwrite` | bool | **Destructive.** Overwrites existing files (default `false`) |

**Output** — `filesCreated[]`, `filesSkipped[]`, `warnings[]`.

**Example**

```json
{
  "resourceName": "Product",
  "fields": [
    { "name": "title", "type": "string", "required": true, "validation": "max:255" },
    { "name": "price", "type": "float", "required": true },
    { "name": "description", "type": "text", "required": false }
  ]
}
```

Generates (in deterministic order):

```
app/Controllers/ProductController.php
app/Services/ProductService.php
app/Repositories/ProductRepositoryInterface.php
app/Repositories/ProductRepository.php
app/Entities/Product.php
app/Database/Migrations/2026_08_12_create_products_table.php
tests/Unit/ProductServiceTest.php
tests/Integration/ProductControllerTest.php
```

Rules: `withRepository=false` → no repositories are generated (the Service stays
contract-first) and it warns; with `withTests=true` and no repository it skips
the unit test and warns. Rate limited.

### 2. `scaffold_controller`

Generates only the Controller. Available methods:
`index | show | store | update | destroy` (default: all).

Hard rule: the controller **only** calls the `{Resource}Service`. If the
generated content included SQL, the tool fails at build-time with
`ConventionViolationError` without writing the file.

### 3. `scaffold_service`

Generates only the Service (business logic + validation). Rule: if the
repository interface does not exist, it reports it in `warnings` but still
generates the Service injecting the interface (**contract first, implementation
later**).

### 4. `scaffold_repository`

Generates **always** interface + implementation together. There is no
implementation without a contract. The implementation uses PDO with
*prepared statements* (SQL-injection safe). Rate limited.

### 5. `validate_route`

**Read only.** Verifies against `app/Config/Routes.php`:

- **Exact** collision (same method + path).
- **Pattern** collision (`/products/{id}` vs `/products/{slug}`).
- Shape errors (unbalanced braces, invalid parameters).

Input: `{ method: "GET|POST|PUT|PATCH|DELETE", path: "/kebab-case/{param}" }`.
Output: `valid`, `conflicts[]`, `suggestions[]`. Never modifies `Routes.php`.

### 6. `run_migration` — DESTRUCTIVE

Runs migrations through the framework's native runner:
`php bin/migrate <direction> [migrationName]`.

Input: `{ direction: "up|down", migrationName?, confirm: boolean }`.

**Hard rule**: if `confirm !== true` the tool returns
`DestructiveOpBlockedError` **without touching the database or executing
anything** (tested: zero executions). Rate limited. `migrationName` is validated
with a regex (only `[a-z0-9_]`, optional `.php`) to prevent path traversal.

### 7. `lint_against_framework_rules`

Validates a PHP file against the conventions. `compliant=false` if at least one
`error` violation exists; `warning`s do not block.

| Rule | Applies to | Severity |
|---|---|---|
| `missing-strict-types` | all | error |
| `naming-convention` | all (class/file/methods) | error |
| `no-query-in-controller` | Controllers | error |
| `missing-input-validation` | Controllers/Services | error |
| `repository-without-interface` | Repositories | error |
| (layer file without class) | Controllers/Services/Repositories/Entities | warning |

---

## Resources

`explain_convention` exposes the framework conventions documentation so the
model generates idiomatic code without hallucinating structure. URIs:

| URI | Content |
|---|---|
| `convention://naming` | PascalCase / camelCase / kebab-case, mandatory suffixes |
| `convention://architecture` | MVC + Service + Repository (lightweight Ports/Adapters) |
| `convention://folder-structure` | Framework folder tree |
| `convention://security-rules` | Hard security rules of the tools |

---

## Generated PHP framework contract

The generated code assumes a minimal framework with:

- **PSR-4** with roots `App\` → `app/` and `Tests\` → `tests/`.
- **PHP 8.2+** and `declare(strict_types=1);` in every file.
- **`app/Config/Routes.php`** with syntax `$routes->get('/products/{id}', 'ProductController::show');`.
- **Native migration runner** `bin/migrate`:
  - `php bin/migrate up|down [migration.php]`
  - Prints one line per executed migration to stdout (relative paths).
- **Base class** `App\Core\Migration` that migrations extend
  (`up(): string` / `down(): string` return SQL).
- **PDO** injected into the repositories.

Generated layers (non-negotiable rules):

- **Controller** — only receives the request, calls the Service, returns the
  response. ZERO business logic, ZERO queries, ZERO inline validation.
- **Service** — business logic + input validation. Receives the Repository by
  dependency injection through the interface.
- **RepositoryInterface** — data access contract (port).
- **Repository** — concrete adapter against the DB (PDO + prepared statements).
- **Entity** — immutable typed object that travels between layers.
- **Migration** — `{YYYY_MM_DD}_create_{table}_table.php` / `Create{Table}Table`.

---

## Security model

- **Zod validation** on every input, without exception.
- No tool passes raw user input to shell, SQL or filesystem without sanitizing
  it and running it through its schema.
- **Least privilege**: all paths are resolved with `resolveInAppRoot` (inside
  `APP_ROOT`); path traversal is blocked and reported as `ValidationError`.
- Every destructive operation requires explicit `confirm`/`overwrite: true`;
  without the flag the tool fails in a controlled way.
- **Rate limiting** (token bucket) on the 3 heavy write tools:
  `scaffold_full_resource`, `scaffold_repository`, `run_migration`.
- Error messages **never expose** absolute system paths, credentials or stack
  traces (unexpected errors are replaced by a generic actionable message).
- The generated PHP code uses prepared statements and validates input in the
  Service (sanitization by default).

---

## Testing

```bash
npm test               # 136 tests: unit + integration + e2e
npm run test:watch     # watch mode
npm run typecheck      # tsc --noEmit over src + tests
```

Coverage:

- **Unit** (`tests/unit/`): core (fs-safe, rate-limiter, config), PHP templates,
  and the 7 tools (happy path, invalid input → typed error, destructive
  operation without confirmation, collision/overwrite, rate limit).
- **Integration** (`tests/integration/server.test.ts`): real server over the SDK
  `InMemoryTransport` — tool/resource listing, protocol calls, alive session
  after errors.
- **E2E** (`tests/integration/e2e.test.ts`): starts `src/index.ts` over stdio,
  JSON-RPC handshake, scaffold of `Product` from scratch, `php -l` of the 8
  generated files (if PHP is installed), `run_migration` blocked without
  `confirm` and executed with a real `bin/migrate`.

---

## Local development

```bash
npm run dev            # tsx src/index.ts (needs APP_ROOT in env)
npm run inspector      # MCP Inspector over the build (node dist/index.js)
```

To test a single tool in isolation with the Inspector:

```bash
APP_ROOT=/path/to/mi-framework npm run inspector
```

### Acceptance verification

Run the end-to-end acceptance checklist against a throwaway framework skeleton
(no cleanup needed, it deletes itself):

Run the checklist against the **local build**:

```bash
npm run build
npm run verify
```

Test the **published package** instead:

```bash
# bash (macOS / Linux)
VERIFY_MCP_COMMAND="npx -y codeigniter-mcp" npm run verify
```

```powershell
# PowerShell (Windows)
$env:VERIFY_MCP_COMMAND = "npx -y codeigniter-mcp"
node scripts/verify-mcp.mjs
```

It reports ✅/❌ per criterion: handshake, 7 tools, 4 resources, full CRUD
scaffold (8 files), `php -l`, lint compliance, route validation, destructive-op
guard, migration execution and path-traversal protection. Exit code `0` means
everything passed.

---

## End-to-end example

1. Set `APP_ROOT` to an empty framework directory.
2. Call `scaffold_full_resource` with `Product` (see the Tool 1 example).
3. Run `validate_route` over `POST /products` (no collisions).
4. Run `run_migration` with `{ direction: "up", confirm: true }` to create the
   `products` table.
5. Run `lint_against_framework_rules` on every generated file:
   all must return `compliant: true`.
6. Run the generated PHP tests: `vendor/bin/phpunit tests/Unit tests/Integration`.

The resource is functional without manual editing (spec acceptance criterion:
*full CRUD generated in <30s, zero post-generation manual edits*).

---

## FAQ

**Can I generate only one layer?** Yes: `scaffold_controller`, `scaffold_service`
and `scaffold_repository` generate individual layers with the same rules.

**What happens if a file already exists?** With `overwrite: false` (default) it
is not touched: the tool reports it in `filesSkipped`/`warnings` with `reason:
exists_no_overwrite`.

**Does the server write outside APP_ROOT?** No. `resolveInAppRoot` prevents it
(`ValidationError` on path traversal attempts).

**How do I disable the rate limit?** Raise `RATE_LIMIT_PER_MINUTE` in the
server configuration.

**Do errors expose system paths?** Never. Unexpected errors always return a
generic actionable message.

---

## Contributing

Contributions are welcome! Read [CONTRIBUTING.md](CONTRIBUTING.md) to set up the
development environment, run the tests and open a pull request. Security issues
should be reported privately — see [SECURITY.md](SECURITY.md). Release history is
tracked in [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE) © 2026 X-Gunner
