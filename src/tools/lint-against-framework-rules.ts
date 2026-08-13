/**
 * Tool 6 — `lint_against_framework_rules` (spec section 2).
 *
 * Validates a PHP file of the framework against the conventions:
 * - `missing-strict-types`        — missing declare(strict_types=1);
 * - `naming-convention`           — class/file/methods (PascalCase/camelCase, suffixes)
 * - `no-query-in-controller`      — SQL or DB access inside a controller
 * - `missing-input-validation`    — input without visible validation (controllers/services)
 * - `repository-without-interface`— repository implementation without its interface
 *
 * `compliant: false` when at least one `severity: "error"` violation exists.
 * `warning`s do not block but are still reported.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { existsSync } from "node:fs";
import { dirname, basename } from "node:path";
import {
  resolveInAppRoot,
  type ToolDeps,
} from "../core/config.js";
import { handleToolCall, ValidationError, type ToolResult } from "../core/errors.js";
import { readFileIfExists } from "../core/fs-safe.js";
import {
  LintInput,
  type LintRuleType,
  type LintSeverityType,
} from "../schemas/lint.schema.js";

export interface LintViolation {
  rule: LintRuleType;
  line?: number;
  message: string;
  severity: LintSeverityType;
}

export interface LintPayload {
  compliant: boolean;
  violations: LintViolation[];
}

type FileKind =
  | "controller"
  | "service"
  | "repository"
  | "repository-interface"
  | "entity"
  | "migration"
  | "other";

const SQL_CONSTRUCT_PATTERN =
  /\bSELECT\b|\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b|\bDELETE\s+FROM\b|\bJOIN\b/i;

const DB_ACCESS_PATTERN = /\$this->db\b|\bDB::|\bPDO\b|->query\(/i;

const RAW_INPUT_PATTERN = /\$_(POST|GET|REQUEST)\b|->getPost\(|->getVar\(/i;

const VALIDATION_PATTERN = /\bvalidate\s*\(|->validation\b|Validation::|->validator\b/i;

function classifyKind(relPath: string, baseName: string): FileKind {
  const normalized = relPath.replace(/\\/g, "/");
  if (normalized.includes("/Controllers/")) return "controller";
  if (normalized.includes("/Services/")) return "service";
  if (normalized.includes("/Repositories/")) {
    return baseName.endsWith("RepositoryInterface")
      ? "repository-interface"
      : "repository";
  }
  if (normalized.includes("/Entities/")) return "entity";
  if (normalized.includes("/Database/Migrations/")) return "migration";
  return "other";
}

/**
 * Removes PHP comments (without affecting strings) for false-positive-free
 * static analysis.
 */
function stripPhpComments(source: string): string {
  let out = "";
  let i = 0;
  const n = source.length;
  let state: "code" | "single" | "double" | "line" | "block" = "code";

  while (i < n) {
    const c = source[i]!;
    const next = source[i + 1];

    if (state === "line") {
      if (c === "\n") {
        out += c;
        state = "code";
      }
      i += 1;
      continue;
    }
    if (state === "block") {
      if (c === "*" && next === "/") {
        i += 2;
        state = "code";
        out += " ";
        continue;
      }
      i += 1;
      continue;
    }
    if (state === "single" || state === "double") {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if ((state === "single" && c === "'") || (state === "double" && c === '"')) {
        state = "code";
      }
      i += 1;
      continue;
    }

    // state === "code"
    if (c === "'") {
      state = "single";
      out += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      state = "double";
      out += c;
      i += 1;
      continue;
    }
    // Heredoc / nowdoc: `<<<IDENT`, `<<<'IDENT'`, `<<<"IDENT"`.
    // Its content is treated as STRING (data), not code: it is blanked until
    // the closing line to avoid false positives and parser desync from quotes.
    if (c === "<" && next === "<" && source[i + 2] === "<") {
      const opener = /^<<<[ \t]*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(
        source.slice(i),
      );
      if (opener !== null) {
        out += " ".repeat(opener[0].length);
        i += opener[0].length;
        const identifier = opener[2]!;
        const closing = new RegExp(
          `^[ \\t]*${escapeRegExp(identifier)}[ \\t]*;?[ \\t]*$`,
        );
        while (i < n) {
          const lineEnd = source.indexOf("\n", i);
          const line = lineEnd === -1 ? source.slice(i) : source.slice(i, lineEnd);
          out += " ".repeat(line.length);
          if (lineEnd === -1) {
            i = n;
            break;
          }
          i = lineEnd + 1;
          if (closing.test(line)) {
            break;
          }
        }
        continue;
      }
    }
    if (c === "/" && next === "/") {
      state = "line";
      i += 2;
      continue;
    }
    if (c === "#") {
      state = "line";
      i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      state = "block";
      out += " ";
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 1-based line number of the first regex match. */
function lineOf(content: string, regex: RegExp): number | undefined {
  const match = regex.exec(content);
  if (match === null) return undefined;
  return content.slice(0, match.index).split("\n").length;
}

export function analyzePhpFile(
  content: string,
  relPath: string,
  appRoot: string,
): LintViolation[] {
  const violations: LintViolation[] = [];
  const baseName = basename(relPath).replace(/\.php$/, "");
  const kind = classifyKind(relPath, baseName);
  const head = content.split("\n").slice(0, 10).join("\n");
  const clean = stripPhpComments(content);

  /* 1. missing-strict-types (error) */
  if (!/declare\s*\(\s*strict_types\s*=\s*1\s*\)\s*;/.test(head)) {
    violations.push({
      rule: "missing-strict-types",
      line: 1,
      message: "Missing declare(strict_types=1); in the first lines of the file.",
      severity: "error",
    });
  }

  /* 2. naming-convention (error) */
  const classMatch =
    /(?:\b(?:final|abstract|readonly)\s+)*(class|interface)\s+([A-Za-z_][A-Za-z0-9_]*)/.exec(
      content,
    );
  if (classMatch !== null) {
    const declared = classMatch[2]!;
    const classLine = lineOf(
      content,
      new RegExp(`(class|interface)\\s+${escapeRegExp(declared)}\\b`),
    );

    if (kind !== "migration" && baseName !== declared) {
      violations.push({
        rule: "naming-convention",
        line: classLine,
        message: `The file name (${baseName}.php) does not match the declared class/interface (${declared}).`,
        severity: "error",
      });
    }
    if (!/^[A-Z]/.test(declared)) {
      violations.push({
        rule: "naming-convention",
        line: classLine,
        message: `The class/interface '${declared}' is not PascalCase.`,
        severity: "error",
      });
    }
    if (kind === "controller" && !declared.endsWith("Controller")) {
      violations.push({
        rule: "naming-convention",
        line: classLine,
        message: `A controller must end in 'Controller' (found: ${declared}).`,
        severity: "error",
      });
    }
    if (kind === "service" && !declared.endsWith("Service")) {
      violations.push({
        rule: "naming-convention",
        line: classLine,
        message: `A service must end in 'Service' (found: ${declared}).`,
        severity: "error",
      });
    }
    if (kind === "repository" && !declared.endsWith("Repository")) {
      violations.push({
        rule: "naming-convention",
        line: classLine,
        message: `A repository implementation must end in 'Repository' (found: ${declared}).`,
        severity: "error",
      });
    }
    if (kind === "repository-interface" && !declared.endsWith("RepositoryInterface")) {
      violations.push({
        rule: "naming-convention",
        line: classLine,
        message: `A repository interface must end in 'RepositoryInterface' (found: ${declared}).`,
        severity: "error",
      });
    }

    /* Methods in camelCase (magic `__*` are skipped). */
    const methodPattern = /\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
    let methodMatch: RegExpExecArray | null;
    while ((methodMatch = methodPattern.exec(content)) !== null) {
      const name = methodMatch[1]!;
      if (name.startsWith("__")) continue;
      if (!/^[a-z][a-zA-Z0-9]*$/.test(name)) {
        violations.push({
          rule: "naming-convention",
          line: lineOf(
            content,
            new RegExp(`function\\s+${escapeRegExp(name)}\\s*\\(`),
          ),
          message: `The method '${name}' is not camelCase.`,
          severity: "error",
        });
      }
    }
  } else if (kind !== "other" && kind !== "migration") {
    // A layer file (controller/service/repository/entity) without a class
    // is suspicious: non-blocking warning.
    violations.push({
      rule: "naming-convention",
      line: lineOf(content, /<\?php/),
      message: "No class/interface found in the file.",
      severity: "warning",
    });
  }

  /* 3. no-query-in-controller (error, controllers only) */
  if (kind === "controller") {
    const sqlLine = lineOf(clean, SQL_CONSTRUCT_PATTERN);
    const dbLine = lineOf(clean, DB_ACCESS_PATTERN);
    if (sqlLine !== undefined || dbLine !== undefined) {
      violations.push({
        rule: "no-query-in-controller",
        line: sqlLine ?? dbLine,
        message:
          "The controller accesses data (SQL or database). All queries must live in the Repository and the logic in the Service.",
        severity: "error",
      });
    }
  }

  /* 4. missing-input-validation (error, controllers and services) */
  if (kind === "controller" || kind === "service") {
    const inputLine = lineOf(clean, RAW_INPUT_PATTERN);
    if (inputLine !== undefined && !VALIDATION_PATTERN.test(clean)) {
      violations.push({
        rule: "missing-input-validation",
        line: inputLine,
        message:
          "Input is accessed without visible validation in the file. Validate the input in the Service layer before using it.",
        severity: "error",
      });
    }
  }

  /* 5. repository-without-interface (error, implementations only) */
  if (kind === "repository") {
    const interfaceAbs = resolveInAppRoot(
      appRoot,
      dirname(relPath),
      `${baseName}Interface.php`,
    );
    if (!existsSync(interfaceAbs)) {
      violations.push({
        rule: "repository-without-interface",
        line: lineOf(
          content,
          new RegExp(`class\\s+${escapeRegExp(baseName)}\\b`),
        ),
        message: `${baseName}Interface.php does not exist. Every repository implementation requires its interface (contract).`,
        severity: "error",
      });
    }
  }

  return violations;
}

export async function lintAgainstFrameworkRules(
  input: unknown,
  deps: ToolDeps,
): Promise<ToolResult<LintPayload>> {
  return handleToolCall(async () => {
    const parsed = LintInput.parse(input);

    const absPath = resolveInAppRoot(deps.appRoot, parsed.filePath);
    const content = readFileIfExists(absPath);
    if (content === null) {
      throw new ValidationError(`File not found: ${parsed.filePath}`);
    }

    const violations = analyzePhpFile(
      content,
      parsed.filePath.replace(/\\/g, "/"),
      deps.appRoot,
    );
    const compliant = !violations.some((violation) => violation.severity === "error");

    return { compliant, violations };
  });
}

export function registerLintAgainstFrameworkRules(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "lint_against_framework_rules",
    {
      title: "Lint against the framework conventions",
      description:
        "Validates a PHP file of the project against the framework conventions: strict_types, naming, " +
        "no queries in controllers, input validation and repositories behind an interface. " +
        "Returns structured violations; compliant=false when there is any error.",
      inputSchema: LintInput,
    },
    async (args) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await lintAgainstFrameworkRules(args, deps), null, 2),
        },
      ],
    }),
  );
}
