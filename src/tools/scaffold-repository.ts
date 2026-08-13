/**
 * Tool 2c — `scaffold_repository` (spec section 2).
 *
 * Always generates the interface and the implementation together.
 * There is no implementation without a contract.
 *
 * Heavy write tool → rate limited.
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
import { ScaffoldRepositoryInput } from "../schemas/scaffold-repository.schema.js";
import {
  renderRepositoryInterfaceTemplate,
  renderRepositoryTemplate,
} from "../templates/repository.template.js";

export interface ScaffoldRepositoryPayload {
  filesCreated: string[];
  warnings: string[];
}

export async function scaffoldRepository(
  input: unknown,
  deps: ToolDeps,
): Promise<ToolResult<ScaffoldRepositoryPayload>> {
  return handleToolCall(async () => {
    const parsed = ScaffoldRepositoryInput.parse(input);
    const ctx = buildResourceContext(parsed.resourceName, parsed.fields);

    // Heavy write tool → consume a rate limiter token.
    deps.rateLimiter.consume();

    const files: Array<{ rel: string; content: string }> = [
      {
        rel: `app/Repositories/${ctx.className}RepositoryInterface.php`,
        content: renderRepositoryInterfaceTemplate(ctx),
      },
      {
        rel: `app/Repositories/${ctx.className}Repository.php`,
        content: renderRepositoryTemplate(ctx),
      },
    ];

    const filesCreated: string[] = [];
    const warnings: string[] = [];

    for (const file of files) {
      const absPath = resolveInAppRoot(deps.appRoot, file.rel);
      const result = safeWriteFile(absPath, file.content, parsed.overwrite);
      const relative = toRelativePath(deps.appRoot, absPath);
      if (result.written) {
        filesCreated.push(relative);
      } else {
        warnings.push(`${relative} already exists and overwrite=false; not modified.`);
      }
    }

    return { filesCreated, warnings };
  });
}

export function registerScaffoldRepository(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "scaffold_repository",
    {
      title: "Generate PHP Repository (interface + implementation)",
      description:
        "Generates the Repository of a resource: ALWAYS the interface (contract) and the implementation " +
        "(PDO adapter with prepared statements) together. " +
        "Does not overwrite existing files unless overwrite=true.",
      inputSchema: ScaffoldRepositoryInput,
    },
    async (args) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await scaffoldRepository(args, deps), null, 2),
        },
      ],
    }),
  );
}
