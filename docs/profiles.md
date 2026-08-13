# Project profiles

The tools target **one of two framework profiles**. The profile is decided by
precedence: **explicit `.codeigniter-mcp.json` > structure detection > `spec`**.

## Profiles

| Profile | Behavior |
|---|---|
| `spec` (default) | The built-in CodeIgniter-style contract: Controller + Service + Repository + Entity + PDO + `bin/migrate` + camelCase + `strict_types`. |
| `ci4` | **CodeIgniter 4 native**: `BaseController` + Model (Query Builder) + forge migrations + views; migrations run with `php spark migrate`; snake_case allowed; `strict_types` not required. |

## Explicit file (`.codeigniter-mcp.json`)

An optional file at the project root tells the tools which framework to target:

```json
{ "framework": "ci4" }
```

Optional overrides: `methodCase` (`"camelCase"` | `"snake_case"`) and
`requireStrictTypes` (boolean). With `ci4`, `scaffold_full_resource` generates
Controller + Model + Migration + View, `scaffold_service` generates the Model,
and `scaffold_repository` is a no-op (CI4 uses Models).

## Auto-detection

If the file is missing, the profile is inferred from the project structure at
APP_ROOT, so a native CI4 project works with zero config:

- `app/Config/Paths.php` or the `spark` runner → `ci4`
- `bin/migrate` or `app/Repositories` → `spec`
- Unknown structure → `spec` (default)

## Requirements

| Dependency | Version | Notes |
|---|---|---|
| Node.js | >= 20.12 | MCP server runtime + tooling (tested on Node 24) |
| npm | >= 9 | Package manager |
| PHP | 8.2+ | Only to **run** the generated code (not to run the MCP server) |
| Composer / PHPUnit | — | For the generated PHP tests |

## Generated PHP framework contract (spec profile)

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

With the `ci4` profile the generated code is native CodeIgniter 4
(`BaseController`, Model, forge migrations, views) and only needs an installed
CI4 project (`composer create-project codeigniter4/appstarter`).
