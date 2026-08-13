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
import { renderCi4Model, renderCi4Service } from "../templates/ci4.template.js";
import { renderServiceTemplate } from "../templates/service.template.js";

export interface ScaffoldServicePayload {
  /** Main generated file (spec: Service; ci4: Service). */
  filePath: string;
  written: boolean;
  /** Extra files generated on top of the main one (ci4: the Model). */
  additionalFilesCreated: string[];
  warnings: string[];
}

export async function scaffoldService(
  input: unknown,
  deps: ToolDeps,
): Promise<ToolResult<ScaffoldServicePayload>> {
  return handleToolCall(async () => {
    const parsed = ScaffoldServiceInput.parse(input);
    const ctx = buildResourceContext(parsed.resourceName, []);
    const warnings: string[] = [];
    const additionalFilesCreated: string[] = [];

    let rel: string;
    let content: string;

    if (deps.conventions.framework === "ci4") {
      // CI4 Service: business logic layer that injects the Model.
      rel = `app/Services/${ctx.className}Service.php`;
      content = renderCi4Service(ctx);
      if (parsed.withRepository) {
        // withRepository in ci4 means "also generate the Model" (the data
        // layer the Service depends on).
        const modelRel = `app/Models/${ctx.className}Model.php`;
        const modelAbs = resolveInAppRoot(deps.appRoot, modelRel);
        const modelResult = safeWriteFile(
          modelAbs,
          renderCi4Model(ctx),
          parsed.overwrite,
        );
        if (modelResult.written) {
          additionalFilesCreated.push(toRelativePath(deps.appRoot, modelAbs));
        } else {
          warnings.push(
            `${modelRel} already exists and overwrite=false; not modified.`,
          );
        }
      } else {
        warnings.push(
          "withRepository=false: the Service was generated without the Model. " +
            "Generate the Model with scaffold_full_resource or with withRepository=true.",
        );
      }
    } else {
      rel = `app/Services/${ctx.className}Service.php`;
      const rendered = renderServiceTemplate(ctx);
      content = rendered.content;
      warnings.push(...rendered.warnings);

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
    }

    const absPath = resolveInAppRoot(deps.appRoot, ...rel.split("/"));
    const result = safeWriteFile(absPath, content, parsed.overwrite);
    const relative = toRelativePath(deps.appRoot, absPath);

    return {
      filePath: relative,
      written: result.written,
      additionalFilesCreated,
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
