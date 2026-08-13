/**
 * Resource — `explain_convention` (spec section 2, Tool 5).
 *
 * Not a tool: SDK resources (ReadResourceCallback) accessed by URI.
 *
 * Available URIs:
 * - convention://naming
 * - convention://architecture
 * - convention://folder-structure
 * - convention://security-rules
 *
 * Content comes directly from the specification so the model generates
 * idiomatic code without hallucinating structure.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

interface ConventionEntry {
  title: string;
  body: string;
}

const CONVENTIONS: Record<string, ConventionEntry> = {
  naming: {
    title: "Framework naming conventions",
    body: `# Framework naming conventions

- Classes: \`PascalCase\` (e.g. \`ProductController\`, \`ProductService\`).
- Methods: \`camelCase\` (e.g. \`getById\`, \`findAll\`).
- Routes: \`kebab-case\` (e.g. \`/api/products/{id}\`).
- Mandatory suffixes:
  - Controllers: \`Controller\` (e.g. \`ProductController\`)
  - Services: \`Service\` (e.g. \`ProductService\`)
  - Repositories: \`Repository\` (implementation) and \`RepositoryInterface\` (contract)
- PHP 8.2+, PSR-4, strict typing (\`declare(strict_types=1);\` in every generated file).

Rule: the file name must match the declared class/interface
(except migrations, which carry a timestamp prefix).`,
  },
  architecture: {
    title: "Framework architecture (MVC + Service + Repository)",
    body: `# Framework architecture (MVC + Service + Repository)

Pattern: MVC + optional Services/Repository layer (light Ports/Adapters,
NOT full Hexagonal). Absolute priority: development speed.

- Controller: only receives the request, calls the Service and returns the response.
  ZERO business logic, ZERO direct queries, ZERO inline validation.
- Service: contains the business logic and input validation. Receives the
  Repository through dependency injection via the interface.
- RepositoryInterface: data access contract (port).
- Repository: concrete adapter against the database (PDO + prepared statements).
- Entity/DTO: typed object that travels between layers, never loose arrays.
- Migration: follows the framework's native migration system
  (\`php bin/migrate up|down\`).`,
  },
  "folder-structure": {
    title: "Framework folder structure",
    body: `# Framework folder structure

\`\`\`
mi-framework/
├── app/
│   ├── Controllers/{Resource}Controller.php
│   ├── Services/{Resource}Service.php
│   ├── Repositories/{Resource}RepositoryInterface.php
│   ├── Repositories/{Resource}Repository.php
│   ├── Entities/{Resource}.php
│   ├── Config/Routes.php
│   └── Database/Migrations/{timestamp}_create_{resource}_table.php
└── tests/
    ├── Unit/{Resource}ServiceTest.php
    └── Integration/{Resource}ControllerTest.php
\`\`\`

Every read/write path of the tools is relative to \`APP_ROOT\`
(framework root), never to arbitrary system absolute paths.`,
  },
  "security-rules": {
    title: "Hard security rules of the framework",
    body: `# Hard security rules (apply to ALL tools)

- Zod input validation on every tool, no exceptions.
- No tool passes raw user input to shell, SQL or filesystem without
  sanitization and without passing through its schema.
- Every tool only accesses the paths it needs (principle of least privilege).
- Every destructive operation requires an explicit \`confirm\`/\`overwrite\` in
  \`true\`. Without that flag the tool fails in a controlled way and reports it.
- Rate limiting enabled on the heavy write tools
  (\`scaffold_full_resource\`, \`scaffold_repository\`, \`run_migration\`).
- No error message exposes absolute system paths, DB credentials or full
  stack traces: only the error type and an actionable message.
- The generated PHP code uses prepared statements (SQL-injection safe) and
  validates the input in the Service layer (sanitization by default).`,
  },
};

export function registerExplainConvention(server: McpServer): void {
  for (const [key, entry] of Object.entries(CONVENTIONS)) {
    server.registerResource(
      `explain-convention-${key}`,
      `convention://${key}`,
      {
        title: entry.title,
        description: `Framework convention: ${entry.title}`,
        mimeType: "text/markdown",
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href,
            text: entry.body,
            mimeType: "text/markdown",
          },
        ],
      }),
    );
  }
}
