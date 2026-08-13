/**
 * Zod schema for the optional per-project conventions file
 * (`.codeigniter-mcp.json` at APP_ROOT).
 *
 * The file lets a project declare which framework profile the tools should
 * target (spec → the built-in CodeIgniter-style contract, ci4 → CodeIgniter 4
 * native) plus optional overrides. A missing or empty file means "spec".
 */
import { z } from "zod";

export const ProjectConventionsFileSchema = z
  .object({
    framework: z.enum(["spec", "ci4"]).default("spec"),
    methodCase: z.enum(["camelCase", "snake_case"]).optional(),
    requireStrictTypes: z.boolean().optional(),
  })
  .strict();

export type ProjectConventionsFile = z.infer<
  typeof ProjectConventionsFileSchema
>;
