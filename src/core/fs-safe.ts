/**
 * Safe file writing.
 *
 * Contract (spec section 1, `fs-safe.ts`):
 * - Every server write goes through `safeWriteFile`. Never use raw
 *   `fs.writeFileSync` inside a tool.
 * - If the file exists and `overwrite === false` → it does NOT write and
 *   reports `reason: "exists_no_overwrite"` in the result (no exception)
 *   so the tool can include it in `filesSkipped`.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface SafeWriteResult {
  written: boolean;
  path: string;
  reason?: "exists_no_overwrite" | "written" | "overwritten";
}

/**
 * Writes `content` to `path` honoring the overwrite policy.
 * Creates intermediate directories if they do not exist.
 *
 * @returns `SafeWriteResult` — never throws because "already exists".
 */
export function safeWriteFile(
  path: string,
  content: string,
  overwrite: boolean,
): SafeWriteResult {
  if (existsSync(path) && !overwrite) {
    return { written: false, path, reason: "exists_no_overwrite" };
  }
  mkdirSync(dirname(path), { recursive: true });
  const existed = existsSync(path);
  writeFileSync(path, content, {
    encoding: "utf8",
    flag: existed && overwrite ? "w" : "wx",
  });
  return { written: true, path, reason: existed && overwrite ? "overwritten" : "written" };
}

/**
 * Reads a file if it exists; returns `null` otherwise.
 * Useful for read-only tools (validate_route, lint).
 */
export function readFileIfExists(path: string): string | null {
  if (!existsSync(path)) {
    return null;
  }
  return readFileSync(path, "utf8");
}

/** Checks whether a path exists and is a directory. */
export function isDirectory(path: string): boolean {
  if (!existsSync(path)) {
    return false;
  }
  return statSync(path).isDirectory();
}
