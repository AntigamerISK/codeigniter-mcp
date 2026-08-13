/**
 * Zod schema for `lint_against_framework_rules` (spec section 2, Tool 6).
 */

import { z } from "zod";

export const LintRule = z.enum([
  "no-query-in-controller",
  "naming-convention",
  "missing-strict-types",
  "missing-input-validation",
  "repository-without-interface",
]);

export const LintSeverity = z.enum(["error", "warning"]);

export const LintInput = z.object({
  filePath: z.string().min(1, "filePath is required"),
});

export const LintOutput = z.object({
  compliant: z.boolean(),
  violations: z.array(
    z.object({
      rule: LintRule,
      line: z.number().optional(),
      message: z.string(),
      severity: LintSeverity,
    }),
  ),
});

export type LintInputType = z.infer<typeof LintInput>;
export type LintRuleType = z.infer<typeof LintRule>;
export type LintSeverityType = z.infer<typeof LintSeverity>;
