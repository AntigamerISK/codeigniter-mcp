/**
 * Zod schema for `scaffold_service` (spec section 2, Tool 2b).
 */

import { z } from "zod";

export const ScaffoldServiceInput = z.object({
  resourceName: z
    .string()
    .regex(/^[A-Z][a-zA-Z]*$/, "Must be PascalCase, e.g. Product")
    .min(2)
    .max(40),
  withRepository: z.boolean().default(true),
  overwrite: z.boolean().default(false),
});

export const ScaffoldServiceOutput = z.object({
  success: z.boolean(),
  filePath: z.string(),
  written: z.boolean(),
  warnings: z.array(z.string()),
});

export type ScaffoldServiceInputType = z.infer<typeof ScaffoldServiceInput>;
