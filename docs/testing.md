# Testing & local development

## Tests

```bash
npm test               # 154 tests: unit + integration + e2e
npm run test:watch     # watch mode
npm run typecheck      # tsc --noEmit over src + tests
```

Coverage:

- **Unit** (`tests/unit/`): core (fs-safe, rate-limiter, config), PHP templates,
  and the 7 tools (happy path, invalid input → typed error, destructive
  operation without confirmation, collision/overwrite, rate limit).
- **Integration** (`tests/integration/server.test.ts`): real server over the SDK
  `InMemoryTransport` — tool/resource/prompt listing, protocol calls, alive
  session after errors.
- **E2E** (`tests/integration/e2e.test.ts`): starts `src/index.ts` over stdio,
  JSON-RPC handshake, scaffold of `Product` from scratch, `php -l` of the 8
  generated files (if PHP is installed), `run_migration` blocked without
  `confirm` and executed with a real `bin/migrate`.

## Local development

```bash
npm run dev            # tsx src/index.ts (needs APP_ROOT in env)
npm run inspector      # MCP Inspector over the build (node dist/index.js)
```

To test a single tool in isolation with the Inspector:

```bash
APP_ROOT=/path/to/mi-framework npm run inspector
```

## Acceptance verification (`npm run verify`)

End-to-end acceptance checklist against a throwaway framework skeleton
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

It reports ✅/❌ per criterion: handshake, 7 tools, 4 resources, 3 prompts, full
CRUD scaffold (8 files), `php -l`, lint compliance, route validation,
destructive-op guard, migration execution, path-traversal protection and
runner-failure interpretation. Exit code `0` means everything passed.

## Remote deployment (Streamable HTTP)

```bash
MCP_TRANSPORT=http MCP_PORT=3000 APP_ROOT=/path/to/mi-framework npx -y codeigniter-mcp
# or, from a local build:
# MCP_TRANSPORT=http MCP_PORT=3000 APP_ROOT=/path/to/mi-framework node dist/index.js
```

Clients connect to `http://localhost:3000/`. The SDK 1.x stdio transport uses
newline-delimited JSON messages (no `Content-Length`); official clients handle
it automatically.
