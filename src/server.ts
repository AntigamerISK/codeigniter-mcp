/**
 * MCP server factory (kept separate from the entry point for tests).
 *
 * Registers the 7 tools + 4 convention resources on an `McpServer`
 * from the official SDK.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createRequire } from "node:module";
import type { ToolDeps } from "./core/config.js";
import { registerExplainConvention } from "./resources/explain-convention.js";
import { registerLintAgainstFrameworkRules } from "./tools/lint-against-framework-rules.js";
import { registerRunMigration } from "./tools/run-migration.js";
import { registerScaffoldController } from "./tools/scaffold-controller.js";
import { registerScaffoldFullResource } from "./tools/scaffold-full-resource.js";
import { registerScaffoldRepository } from "./tools/scaffold-repository.js";
import { registerScaffoldService } from "./tools/scaffold-service.js";
import { registerValidateRoute } from "./tools/validate-route.js";

const require = createRequire(import.meta.url);

export const SERVER_NAME = "codeigniter-mcp";
/** Read from package.json so the reported version never drifts. */
export const SERVER_VERSION = (require("../package.json") as { version: string }).version;

export const TOOL_NAMES = [
  "scaffold_full_resource",
  "scaffold_controller",
  "scaffold_service",
  "scaffold_repository",
  "validate_route",
  "run_migration",
  "lint_against_framework_rules",
] as const;

export const RESOURCE_URIS = [
  "convention://naming",
  "convention://architecture",
  "convention://folder-structure",
  "convention://security-rules",
] as const;

/** Builds the MCP server with all tools and resources registered. */
export function buildServer(deps: ToolDeps): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerScaffoldFullResource(server, deps);
  registerScaffoldController(server, deps);
  registerScaffoldService(server, deps);
  registerScaffoldRepository(server, deps);
  registerValidateRoute(server, deps);
  registerRunMigration(server, deps);
  registerLintAgainstFrameworkRules(server, deps);
  registerExplainConvention(server);
  return server;
}
