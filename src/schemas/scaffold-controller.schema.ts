/**
 * Zod schema for `scaffold_controller` (spec section 2, Tool 2a).
 */

import { z } from "zod";

export const ControllerMethod = z.enum([
  "index",
  "show",
  "store",
  "update",
  "destroy",
]);

export const ScaffoldControllerInput = z.object({
  resourceName: z
    .string()
    .regex(/^[A-Z][a-zA-Z]*$/, "Must be PascalCase, e.g. Product")
    .min(2)
    .max(40),
  methods: z.array(ControllerMethod).default(["index", "show", "store", "update", "destroy"]),
  overwrite: z.boolean().default(false),
});

export const ScaffoldControllerOutput = z.object({
  success: z.boolean(),
  filePath: z.string(),
  written: z.boolean(),
  warnings: z.array(z.string()),
});

export type ScaffoldControllerInputType = z.infer<typeof ScaffoldControllerInput>;
export type ControllerMethodType = z.infer<typeof ControllerMethod>;
