/**
 * Zod schema for `run_migration` (spec section 2, Tool 4 — DESTRUCTIVE).
 *
 * Hard rule: `confirm` must be explicitly `true`. Without that flag the tool
 * returns `DestructiveOpBlockedError` and does NOT touch the database.
 */

import { z } from "zod";

export const MigrationDirection = z.enum(["up", "down"]);

export const RunMigrationInput = z.object({
  direction: MigrationDirection,
  // Only safe file names: prevents path traversal.
  migrationName: z
    .string()
    .regex(/^[a-z0-9_]+(?:\.php)?$/, "Invalid migration name (only a-z0-9_ and .php)")
    .optional(),
  confirm: z.boolean(),
});

export const RunMigrationOutput = z.object({
  success: z.boolean(),
  executed: z.array(z.string()),
  error: z
    .object({
      type: z.string(),
      message: z.string(),
    })
    .optional(),
});

export type RunMigrationInputType = z.infer<typeof RunMigrationInput>;
export type MigrationDirectionType = z.infer<typeof MigrationDirection>;
