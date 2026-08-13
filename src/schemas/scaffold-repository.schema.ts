/**
 * Zod schema for `scaffold_repository` (spec section 2, Tool 2c).
 */

import { z } from "zod";

export const ScaffoldRepositoryInput = z.object({
  resourceName: z
    .string()
    .regex(/^[A-Z][a-zA-Z]*$/, "Must be PascalCase, e.g. Product")
    .min(2)
    .max(40),
  fields: z
    .array(
      z.object({
        name: z.string().regex(/^[a-z][a-zA-Z]*$/, "camelCase required"),
        type: z.enum(["string", "int", "float", "boolean", "date", "text"]),
      }),
    )
    .min(1, "At least one field must be defined")
    .max(50, "Maximum of 50 fields per resource"),
  overwrite: z.boolean().default(false),
});

export const ScaffoldRepositoryOutput = z.object({
  success: z.boolean(),
  filesCreated: z.array(z.string()),
  warnings: z.array(z.string()),
});

export type ScaffoldRepositoryInputType = z.infer<typeof ScaffoldRepositoryInput>;
