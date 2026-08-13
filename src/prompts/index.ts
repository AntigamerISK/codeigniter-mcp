/**
 * MCP prompts — token-saving templates for high-frequency operations.
 *
 * A prompt turns a compact natural-language description into the exact tool
 * arguments, so the model does not have to reconstruct the tool schemas by
 * hand (which costs tokens and invites schema errors). Every prompt returns
 * a single "user" message with the ready-to-call JSON.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, ZodError } from "zod";
import { ValidationError } from "../core/errors.js";
import { ScaffoldFullResourceInput } from "../schemas/scaffold-full-resource.schema.js";

export const PROMPT_NAMES = [
  "create_full_resource",
  "run_migration",
  "lint_file",
] as const;

/**
 * Parses a compact field description into scaffold fields.
 * Syntax: comma-separated `name:type:required` entries.
 * Example: `title:string:true, price:float, desc:text:false`
 * (type defaults to "string", required defaults to true).
 */
function parseFields(
  raw: string,
): Array<{ name: string; type: string; required: boolean }> {
  const entries = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (entries.length === 0) {
    throw new ValidationError(
      "fields must list at least one entry, e.g. 'title:string:true, price:float'.",
    );
  }
  return entries.map((entry) => {
    const [name, type = "string", requiredRaw] = entry
      .split(":")
      .map((s) => s.trim());
    if (!name) {
      throw new ValidationError(
        `Invalid field entry '${entry}'. Expected 'name:type:required', e.g. 'title:string:true'.`,
      );
    }
    return {
      name,
      type,
      required: requiredRaw === undefined ? true : requiredRaw !== "false",
    };
  });
}

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "create_full_resource",
    {
      title: "Create a full CRUD resource",
      description:
        "Builds the exact scaffold_full_resource arguments from a compact description (resource + fields). " +
        "Saves tokens: no need to write the tool schema by hand.",
      argsSchema: {
        resource: z.string().min(2).max(40),
        fields: z.string().min(1),
        withTests: z.coerce.boolean().optional(),
        withRepository: z.coerce.boolean().optional(),
      },
    },
    async (args) => {
      let payload: unknown;
      try {
        payload = ScaffoldFullResourceInput.parse({
          resourceName: args.resource,
          fields: parseFields(args.fields),
          withTests: args.withTests ?? true,
          withRepository: args.withRepository ?? true,
        });
      } catch (err) {
        if (err instanceof ZodError) {
          throw new ValidationError(
            `Invalid create_full_resource arguments: ${err.issues
              .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
              .join("; ")}`,
          );
        }
        throw err;
      }
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Call \`scaffold_full_resource\` with exactly these arguments (do not change the schema):\n\n` +
                `\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n\n` +
                `Rules: overwrite is not set (defaults to false) — never overwrite existing files ` +
                `without an explicit user request.`,
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    "run_migration",
    {
      title: "Run a migration",
      description:
        "Builds the exact run_migration arguments (spec or ci4 runner) and enforces the explicit confirm security rule.",
      argsSchema: {
        direction: z.enum(["up", "down"]),
        // The MCP protocol passes prompt arguments as strings; coerce accepts
        // "true"/"false" (and booleans from in-process clients) into a boolean.
        confirm: z.coerce.boolean(),
      },
    },
    async (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Call \`run_migration\` with exactly these arguments:\n\n` +
              `\`\`\`json\n${JSON.stringify(args, null, 2)}\n\`\`\`\n\n` +
              `Security rule: \`confirm\` must be \`true\` to execute (destructive operation). ` +
              `If the user did not explicitly confirm, pass \`confirm: false\` — the tool blocks without executing.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "lint_file",
    {
      title: "Lint a PHP file",
      description:
        "Builds the exact lint_against_framework_rules arguments for a file path inside APP_ROOT.",
      argsSchema: {
        filePath: z.string().min(1),
      },
    },
    async (args) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Call \`lint_against_framework_rules\` with exactly these arguments:\n\n` +
              `\`\`\`json\n${JSON.stringify(args, null, 2)}\n\`\`\`\n\n` +
              `The file path must stay inside APP_ROOT.`,
          },
        },
      ],
    }),
  );
}
