/**
 * Zod schema for `validate_route` (spec section 2, Tool 3).
 */

import { z } from "zod";

export const RouteMethod = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export const ValidateRouteInput = z.object({
  method: RouteMethod,
  path: z
    .string()
    .regex(/^\/[a-z0-9\-\/{}]*$/, "kebab-case, may use {param}"),
});

export const ValidateRouteOutput = z.object({
  valid: z.boolean(),
  conflicts: z.array(
    z.object({
      existingMethod: z.string(),
      existingPath: z.string(),
      reason: z.string(),
    }),
  ),
  suggestions: z.array(z.string()),
});

export type ValidateRouteInputType = z.infer<typeof ValidateRouteInput>;
export type RouteMethodType = z.infer<typeof RouteMethod>;
