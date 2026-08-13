/**
 * Tool 4 — `run_migration` (spec section 2) — DESTRUCTIVE.
 *
 * Hard rule: if `confirm !== true` the tool returns immediately
 * `{ success: false, error: { type: "DestructiveOpBlockedError", ... } }`
 * WITHOUT touching the database (zero queries).
 *
 * With `confirm: true` it delegates execution to the framework's native
 * runner (`php bin/migrate <direction> [migrationName]`) via `MigrationExecutor`.
 *
 * Heavy write tool → rate limited.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { existsSync } from "node:fs";
import {
  resolveInAppRoot,
  type ToolDeps,
} from "../core/config.js";
import {
  DestructiveOpBlockedError,
  handleToolCall,
  ValidationError,
  type ToolResult,
} from "../core/errors.js";
import { RunMigrationInput } from "../schemas/run-migration.schema.js";

export interface RunMigrationPayload {
  executed: string[];
}

export async function runMigration(
  input: unknown,
  deps: ToolDeps,
): Promise<ToolResult<RunMigrationPayload>> {
  return handleToolCall(async () => {
    const parsed = RunMigrationInput.parse(input);

    // Hard rule: without explicit confirmation, NOTHING is executed.
    if (parsed.confirm !== true) {
      throw new DestructiveOpBlockedError(
        "This operation requires an explicit confirm: true from the user.",
      );
    }

    // Heavy write tool → consume a rate limiter token.
    deps.rateLimiter.consume();

    let migrationName: string | null = null;
    if (parsed.migrationName !== undefined) {
      migrationName = parsed.migrationName.endsWith(".php")
        ? parsed.migrationName
        : `${parsed.migrationName}.php`;
      const absPath = resolveInAppRoot(
        deps.appRoot,
        "app",
        "Database",
        "Migrations",
        migrationName,
      );
      if (!existsSync(absPath)) {
        throw new ValidationError(`Migration not found: ${migrationName}`);
      }
    }

    const { executed } = await deps.migrationExecutor.execute(
      parsed.direction,
      migrationName,
      deps.appRoot,
    );

    return { executed };
  });
}

export function registerRunMigration(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "run_migration",
    {
      title: "Run migrations (DESTRUCTIVE)",
      description:
        "Runs framework migrations (up/down) through the native runner `php bin/migrate`. " +
        "DESTRUCTIVE OPERATION: requires an explicit confirm: true. Without that flag nothing is executed.",
      inputSchema: RunMigrationInput,
    },
    async (args) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await runMigration(args, deps), null, 2),
        },
      ],
    }),
  );
}
