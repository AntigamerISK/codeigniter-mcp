#!/usr/bin/env node

/**
 * Entry point of the `codeigniter-mcp` server.
 *
 * - Default transport: stdio (local use in Claude Code / Cursor / VS Code).
 * - Optional support: Streamable HTTP (`MCP_TRANSPORT=http`) for remote use.
 *
 * Environment configuration (see mcp.json):
 * - APP_ROOT: root of the target PHP framework (required).
 * - RATE_LIMIT_PER_MINUTE: write operations per minute (default 20).
 * - MCP_TRANSPORT: "stdio" (default) | "http".
 * - MCP_PORT: port for the HTTP transport (default 3000).
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createToolDepsFromEnv } from "./core/config.js";
import { startHttpTransport } from "./http-transport.js";
import { buildServer, SERVER_NAME, SERVER_VERSION } from "./server.js";

const DEFAULT_HTTP_PORT = 3000;

function log(message: string): void {
  // Always stderr: stdout is reserved for the JSON-RPC (stdio) protocol.
  process.stderr.write(`[codeigniter-mcp] ${message}\n`);
}

async function main(): Promise<void> {
  const deps = createToolDepsFromEnv();
  const server = buildServer(deps);

  const transport =
    process.env.MCP_TRANSPORT === "http"
      ? (
          await startHttpTransport(
            Number.parseInt(process.env.MCP_PORT ?? "", 10) || DEFAULT_HTTP_PORT,
          )
        ).transport
      : new StdioServerTransport();

  await server.connect(transport);
  log(`Server ${SERVER_NAME} v${SERVER_VERSION} ready.`);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  log(`Fatal error on startup: ${message}`);
  process.exit(1);
});
