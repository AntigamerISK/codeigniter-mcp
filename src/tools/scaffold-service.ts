/**
 * Tool 2b — `scaffold_service` (spec section 2).
 *
 * Generates the PHP Service of a resource (business logic layer).
 * Rule: if `withRepository === true` and `{Resource}RepositoryInterface.php`
 * does not exist, the tool reports it in `warnings` but still generates the
 * Service injecting the interface (contract first, implementation later).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { existsSync } from "node:fs";
import {
  buildResourceContext,
  resolveInAppRoot,
  toRelativePath,
  type ToolDeps,
} from "../core/config.js";
import { handleToolCall, type ToolResult } from "../core/errors.js";
import { safeWriteFile } from "../core/fs-safe.js";
import { ScaffoldServiceInput } from "../schemas/scaffold-service.schema.js";
import { renderServiceTemplate } from "../templates/service.template.js";

export interface ScaffoldServicePayload {
  filePath: string;
  written: boolean;
  warnings: string[];
}

export async function scaffoldService(
  input: unknown,
  deps: ToolDeps,
): Promise<ToolResult<ScaffoldServicePayload>> {
  return handleToolCall(async () => {
    const parsed = ScaffoldServiceInput.parse(input);
    const ctx = buildResourceContext(parsed.resourceName, []);
    const { content, warnings } = renderServiceTemplate(ctx);

    const interfaceRel = `app/Repositories/${ctx.className}RepositoryInterface.php`;
    if (parsed.withRepository) {
      const interfaceAbs = resolveInAppRoot(deps.appRoot, interfaceRel);
      if (!existsSync(interfaceAbs)) {
        warnings.push(
          `${interfaceRel} does not exist; the Service is generated anyway injecting the interface (contract first). ` +
            "Generate the interface with scaffold_repository.",
        );
      }
    } else {
      warnings.push(
        "withRepository=false: the Service depends on the repository interface (contract first). " +
          "Generate the repositories with scaffold_repository to enable persistence.",
      );
    }

    const absPath = resolveInAppRoot(
      deps.appRoot,
      "app",
      "Services",
      `${ctx.className}Service.php`,
    );
    const result = safeWriteFile(absPath, content, parsed.overwrite);
    const relative = toRelativePath(deps.appRoot, absPath);

    return {
      filePath: relative,
      written: result.written,
      warnings: result.written
        ? warnings
        : [...warnings, `${relative} already exists and overwrite=false; not modified.`],
    };
  });
}

export function registerScaffoldService(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "scaffold_service",
    {
      title: "Generate PHP Service",
      description:
        "Generates a PHP Service for a resource (business logic + input validation). " +
        "Receives the Repository through dependency injection via interface (contract first). " +
        "Does not overwrite existing files unless overwrite=true.",
      inputSchema: ScaffoldServiceInput,
    },
    async (args) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await scaffoldService(args, deps), null, 2),
        },
      ],
    }),
  );
}
