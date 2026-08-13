/**
 * Test helpers shared by the test suite.
 * They use real temp directories to exercise the actual filesystem.
 */

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createToolDeps,
  type MigrationExecutor,
  type ToolDeps,
} from "../src/core/config.js";

/** Fixed date for deterministic outputs. */
export const FIXED_DATE = new Date("2026-08-12T10:30:00.000Z");

/** Creates a temp directory and returns root + cleanup. */
export function makeTempAppRoot(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "codeigniter-mcp-test-"));
  return {
    root,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    },
  };
}

/** Recording migrations executor (never runs real PHP). */
export class RecordingMigrationExecutor implements MigrationExecutor {
  calls: Array<{ direction: string; migrationName: string | null; appRoot: string }> = [];
  result: { executed: string[] } = { executed: [] };
  failWith?: Error;

  async execute(
    direction: "up" | "down",
    migrationName: string | null,
    appRoot: string,
  ): Promise<{ executed: string[] }> {
    this.calls.push({ direction, migrationName, appRoot });
    if (this.failWith) {
      throw this.failWith;
    }
    return this.result;
  }
}

export interface TestContext {
  root: string;
  deps: ToolDeps;
  executor: RecordingMigrationExecutor;
  cleanup: () => void;
}

export interface CreateContextOptions {
  now?: () => Date;
  rateLimitPerMinute?: number;
  executor?: MigrationExecutor;
}

/** Creates a temp APP_ROOT + isolated ToolDeps. */
export function createTestContext(options: CreateContextOptions = {}): TestContext {
  const root = mkdtempSync(join(tmpdir(), "codeigniter-mcp-test-"));
  const executor =
    (options.executor as RecordingMigrationExecutor | undefined) ??
    new RecordingMigrationExecutor();

  const deps = createToolDeps({
    appRoot: root,
    now: options.now ?? (() => FIXED_DATE),
    rateLimitPerMinute: options.rateLimitPerMinute ?? 100,
    migrationExecutor: executor,
  });

  return {
    root,
    deps,
    executor,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    },
  };
}

/** Creates a file (with intermediate directories) inside APP_ROOT. */
export function writeInAppRoot(
  root: string,
  relativePath: string,
  content: string,
): string {
  const absPath = join(root, relativePath.split("/").join("\\"));
  mkdirSync(join(absPath, ".."), { recursive: true });
  writeFileSync(absPath, content, "utf8");
  return absPath;
}

/** Creates a directory inside APP_ROOT. */
export function mkdirInAppRoot(root: string, relativePath: string): string {
  const absPath = join(root, relativePath.split("/").join("\\"));
  mkdirSync(absPath, { recursive: true });
  return absPath;
}

/**
 * Extracts the text of the first content block of a CallToolResult.
 * Double cast through `unknown` to be immune to SDK variants.
 */
export function extractToolText(result: unknown): string {
  const content = (result as unknown as {
    content?: Array<{ text?: string }>;
  })?.content;
  return content?.[0]?.text ?? "{}";
}
