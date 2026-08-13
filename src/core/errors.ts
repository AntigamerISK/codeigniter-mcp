/**
 * Typed error classes of the MCP server.
 *
 * Contract (spec section 1, `errors.ts`):
 * - Every tool catches these errors and returns them as part of its
 *   structured output `{ success: false, error: { type, message } }`.
 * - No tool propagates an uncaught exception that could crash the MCP process.
 * - No message exposes absolute system paths, credentials, or full stack traces.
 */

import { ZodError } from "zod";

/** Invalid input (rejected by Zod). */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Destructive operation without an explicit `confirm`/`overwrite`. */
export class DestructiveOpBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DestructiveOpBlockedError";
  }
}

/** Generated code breaks the framework naming/structure conventions. */
export class ConventionViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConventionViolationError";
  }
}

/** The per-minute operation limit was exceeded. */
export class RateLimitExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitExceededError";
  }
}

/** Structured error that travels inside a tool output. */
export interface ToolError {
  type: string;
  message: string;
}

/** Typed tool result: success payload or structured error (never thrown). */
export type ToolResult<T> =
  | ({ success: true } & T)
  | { success: false; error: ToolError };

const KNOWN_ERROR_TYPES: Record<string, string> = {
  ValidationError: "ValidationError",
  DestructiveOpBlockedError: "DestructiveOpBlockedError",
  ConventionViolationError: "ConventionViolationError",
  RateLimitExceededError: "RateLimitExceededError",
  ZodError: "ValidationError",
};

/**
 * Converts a caught error into a safe `ToolError`.
 *
 * Hard security rule: unexpected errors (unknown type) NEVER expose their
 * original message (it may contain absolute paths or internal details).
 * They are replaced with a generic, actionable message.
 */
export function toToolError(err: unknown): ToolError {
  if (err instanceof Error && KNOWN_ERROR_TYPES[err.name]) {
    return { type: KNOWN_ERROR_TYPES[err.name]!, message: err.message };
  }
  return {
    type: "InternalError",
    message: "An unexpected internal error occurred. Check the arguments and try again.",
  };
}

/**
 * Converts a Zod error into a readable `ValidationError`.
 * The detail includes the field path and the rejection reason.
 */
export function validationErrorFromZod(err: unknown): ValidationError {
  if (err instanceof ZodError) {
    const detail = err.issues
      .map((issue) => {
        const path = issue.path.join(".");
        return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
      })
      .join("; ");
    return new ValidationError(`Invalid input: ${detail}`);
  }
  return new ValidationError("Invalid input.");
}

/**
 * Standard wrapper for every tool body.
 *
 * - If `fn` returns the success payload, it is wrapped with `success: true`.
 * - If `fn` throws a typed error (ValidationError, DestructiveOpBlockedError,
 *   ConventionViolationError, RateLimitExceededError), it becomes a structured
 *   `{ success: false, error }` result.
 * - Any unexpected error becomes an `InternalError` with a generic message
 *   (never exposing absolute paths or stack traces).
 */
export async function handleToolCall<T>(
  fn: () => Promise<T> | T,
): Promise<ToolResult<T>> {
  try {
    const payload = await fn();
    return { success: true, ...payload };
  } catch (err) {
    if (err instanceof ZodError) {
      const validation = validationErrorFromZod(err);
      return {
        success: false,
        error: { type: "ValidationError", message: validation.message },
      };
    }
    return { success: false, error: toToolError(err) };
  }
}
