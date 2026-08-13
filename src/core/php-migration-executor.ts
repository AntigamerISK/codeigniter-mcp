/**
 * Default `MigrationExecutor` implementation.
 *
 * Invokes the framework's native migration runner:
 *   `php bin/migrate <direction> [migrationName]` (cwd = APP_ROOT)
 *
 * Framework contract:
 * - `bin/migrate` must exist at the APP_ROOT root and be an executable PHP
 *   script (`php bin/migrate up|down [name.php]`).
 * - Prints one line per executed migration to stdout (relative paths).
 * - Exit code 0 = success; anything else = error.
 *
 * Security:
 * - `direction` and `migrationName` arrive Zod-validated (enums + regex).
 * - `spawn` with an args array: no intermediate shell is ever executed.
 * - Error messages never expose absolute paths or raw stdout.
 */

import { spawn } from "node:child_process";
import { MigrationExecutor } from "./config.js";

const MIGRATE_SCRIPT = "bin/migrate";
const DEFAULT_TIMEOUT_MS = 60_000;

interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runProcess(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<ProcessResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        rejectPromise(
          new Error(
            `Migration runner exceeded the time limit (${timeoutMs} ms).`,
          ),
        );
      }
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectPromise(new Error(executorErrorMessage(err)));
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise({ code, stdout, stderr });
    });
  });
}

/** Translates process errors without leaking internal details. */
function executorErrorMessage(err: NodeJS.ErrnoException): string {
  switch (err.code) {
    case "ENOENT":
      return "Could not run 'php'. Make sure PHP is installed and in the PATH.";
    case "EACCES":
      return "Permission denied while running the migration runner.";
    default:
      return "Could not run the migration runner.";
  }
}

export class PhpMigrationExecutor implements MigrationExecutor {
  constructor(private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS) {}

  async execute(
    direction: "up" | "down",
    migrationName: string | null,
    appRoot: string,
  ): Promise<{ executed: string[] }> {
    const args = [MIGRATE_SCRIPT, direction];
    if (migrationName !== null) {
      args.push(migrationName);
    }

    const result = await runProcess("php", args, appRoot, this.timeoutMs);

    if (result.code !== 0) {
      const detail = result.stderr.trim().split(/\r?\n/).at(-1) ?? "";
      const reason = detail.length > 0 ? `: ${sanitizeLine(detail)}` : ".";
      throw new Error(`Migration runner failed (code ${result.code})${reason}`);
    }

    const executed = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    return { executed };
  }
}

/** Strips any absolute path from an error line before exposing it. */
function sanitizeLine(line: string): string {
  return line
    .replace(/[A-Za-z]:\\[^\s:]*/g, "<path>")
    .replace(/\/[^\s:]*\/(app|bin|tests)\b/g, "<path>")
    .slice(0, 300);
}
