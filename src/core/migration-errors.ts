/**
 * Interprets the output of the framework's native migration runner
 * (`php bin/migrate` / `php spark migrate`) so the MCP returns an actionable
 * error instead of a raw stack trace, and only counts real migration files as
 * "executed".
 *
 * Security: every line exposed by these helpers is sanitized (no absolute
 * paths). Pattern detection is order-sensitive: more specific PHP errors
 * (parse errors) are checked before generic ones.
 */

interface ErrorPattern {
  kind: string;
  re: RegExp;
  build: (line: string, match?: RegExpExecArray) => string;
}

const PATTERNS: ErrorPattern[] = [
  {
    kind: "parse-error",
    re: /PHP Parse error|Parse error: syntax error|Cannot use anonymous/i,
    build: () =>
      "the runner hit a PHP syntax error (check the migration file for parse errors or anonymous classes).",
  },
  {
    kind: "class-not-found",
    re: /Class ["']?([A-Za-z_\\][A-Za-z0-9_\\]*)["']? not found/i,
    build: (_line, match) =>
      `a referenced class is missing ("${match?.[1] ?? "unknown"}") — check use statements, autoload or the migration name.`,
  },
  {
    kind: "sql-error",
    re: /SQLSTATE\[/i,
    build: () =>
      "the database rejected the migration SQL (constraint, type or table issue).",
  },
  {
    kind: "undefined-function",
    re: /Call to undefined function/i,
    build: () =>
      "the migration calls a function that is not defined in the PHP environment.",
  },
  {
    kind: "fatal-error",
    re: /Fatal error|Uncaught Error|Uncaught Throwable/i,
    build: () =>
      "the runner crashed with a fatal error while executing the migration.",
  },
];

export interface RunnerErrorInfo {
  /** Machine-readable cause (parse-error, class-not-found, sql-error, ...). */
  kind: string;
  /** Actionable one-line interpretation. */
  message: string;
  /** First relevant lines, sanitized (no absolute paths). */
  rawLines: string[];
}

/** Strips absolute paths from an output line before it is exposed. */
export function sanitizeErrorText(line: string): string {
  return line
    .replace(/[A-Za-z]:\\[^\s:]*/g, "<path>")
    .replace(/\/[^\s:]*\/(app|bin|tests|vendor)\b[^\s:]*/g, "<path>")
    .replace(/[^\s:]*[\\/][^\s:]*\.php\b/g, "<path>")
    .trim()
    .slice(0, 300);
}

/**
 * Turns raw runner output into an actionable error. Checks stderr first, then
 * stdout (PHP CLI often prints errors to stdout). Falls back to the last
 * non-empty line when no known pattern matches.
 */
export function interpretPhpRunnerError(
  stdout: string,
  stderr: string,
): RunnerErrorInfo {
  const combined = `${stderr}\n${stdout}`;
  const lines = combined
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const pattern of PATTERNS) {
    const index = lines.findIndex((line) => pattern.re.test(line));
    if (index !== -1) {
      const match = pattern.re.exec(lines[index] ?? "") ?? undefined;
      const message = pattern.build(lines[index] ?? "", match);
      const rawLines = lines
        .slice(index, index + 3)
        .map((line) => sanitizeErrorText(line))
        .filter((line) => line.length > 0);
      return { kind: pattern.kind, message, rawLines };
    }
  }

  const last = sanitizeErrorText(lines.at(-1) ?? "");
  return {
    kind: "runner-error",
    message: last
      ? `the runner failed without a known pattern (last output: "${last}").`
      : "the runner failed without any output.",
    rawLines: lines.slice(-3).map((line) => sanitizeErrorText(line)),
  };
}

/**
 * Extracts the actually executed migrations from the runner stdout.
 * Only lines that reference a `.php` file are counted — spark prints table
 * headers and status lines that would otherwise pollute the result.
 */
export function filterExecutedMigrationLines(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line.includes(".php"));
}
