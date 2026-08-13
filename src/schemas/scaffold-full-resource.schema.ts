/**
 * Zod schema for `scaffold_full_resource` (spec section 2, Tool 1).
 */

import { z } from "zod";

const FieldSchema = z.object({
  name: z
    .string()
    .regex(/^[a-z][a-zA-Z]*$/, "camelCase required (e.g. title, unitPrice)"),
  type: z.enum(["string", "int", "float", "boolean", "date", "text"]),
  required: z.boolean().default(true),
  validation: z.string().optional(),
});

export const ScaffoldFullResourceInput = z.object({
  resourceName: z
    .string()
    .regex(/^[A-Z][a-zA-Z]*$/, "Must be PascalCase, e.g. Product")
    .min(2, "resourceName must have at least 2 characters")
    .max(40, "resourceName cannot exceed 40 characters"),
  fields: z
    .array(FieldSchema)
    .min(1, "At least one field must be defined")
    .max(50, "Maximum of 50 fields per resource"),
  withTests: z.boolean().default(true),
  withRepository: z.boolean().default(true),
  overwrite: z.boolean().default(false),
});

export const ScaffoldFullResourceOutput = z.object({
  success: z.boolean(),
  filesCreated: z.array(z.string()),
  filesSkipped: z.array(z.string()),
  warnings: z.array(z.string()),
});

export type ScaffoldFullResourceInputType = z.infer<typeof ScaffoldFullResourceInput>;
export type FieldInputType = z.infer<typeof FieldSchema>;
