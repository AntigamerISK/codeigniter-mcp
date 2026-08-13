/**
 * Tool 2a — `scaffold_controller` (spec section 2).
 *
 * Generates the PHP Controller of a resource. Rules:
 * - The controller ONLY calls `{Resource}Service`.
 * - Build-time static check: if the generated content included SQL, the tool
 *   fails with `ConventionViolationError` without writing the file.
 * - Never overwrites without an explicit `overwrite: true`.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  buildResourceContext,
  resolveInAppRoot,
  toRelativePath,
  type ToolDeps,
} from "../core/config.js";
import { handleToolCall, type ToolResult } from "../core/errors.js";
import { safeWriteFile } from "../core/fs-safe.js";
import { ScaffoldControllerInput } from "../schemas/scaffold-controller.schema.js";
import {
  assertNoSqlInController,
  renderControllerTemplate,
} from "../templates/controller.template.js";

export interface ScaffoldControllerPayload {
  filePath: string;
  written: boolean;
  warnings: string[];
}

export async function scaffoldController(
  input: unknown,
  deps: ToolDeps,
): Promise<ToolResult<ScaffoldControllerPayload>> {
  return handleToolCall(async () => {
    const parsed = ScaffoldControllerInput.parse(input);
    const ctx = buildResourceContext(parsed.resourceName, []);

    const content = renderControllerTemplate(ctx, parsed.methods);
    // Hard framework rule: zero SQL in controllers.
    assertNoSqlInController(content);

    const absPath = resolveInAppRoot(
      deps.appRoot,
      "app",
      "Controllers",
      `${ctx.className}Controller.php`,
    );
    const result = safeWriteFile(absPath, content, parsed.overwrite);
    const relative = toRelativePath(deps.appRoot, absPath);

    return {
      filePath: relative,
      written: result.written,
      warnings: result.written
        ? []
        : [`${relative} already exists and overwrite=false; not modified.`],
    };
  });
}

export function registerScaffoldController(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "scaffold_controller",
    {
      title: "Generate PHP Controller",
      description:
        "Generates a PHP Controller for a resource (presentation layer only). " +
        "The controller only calls the corresponding Service: zero queries and zero inline validation. " +
        "Does not overwrite existing files unless overwrite=true.",
      inputSchema: ScaffoldControllerInput,
    },
    async (args) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await scaffoldController(args, deps), null, 2),
        },
      ],
    }),
  );
}
