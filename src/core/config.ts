/**
 * Framework configuration and conventions (spec section 1, `config.ts`).
 *
 * Single source of truth for:
 * - Base paths (`APP_ROOT`) and safe path resolution inside the project.
 * - Naming conventions (PascalCase / camelCase / kebab-case, suffixes).
 * - Field type mapping (`string|int|float|boolean|date|text`) to PHP types
 *   and migration column types.
 * - `ToolDeps` construction (dependency injection for every tool).
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { ValidationError } from "./errors.js";
import { PhpMigrationExecutor } from "./php-migration-executor.js";
import { RateLimiter } from "./rate-limiter.js";
import { ProjectConventionsFileSchema } from "../schemas/conventions.schema.js";

/** Default limit: 20 write operations per minute per session. */
export const DEFAULT_RATE_LIMIT_PER_MINUTE = 20;

export type FieldType = "string" | "int" | "float" | "boolean" | "date" | "text";

/** Field as received by a tool (already validated by Zod). */
export interface FieldInput {
  name: string;
  type: FieldType;
  required?: boolean;
  validation?: string;
}

/** Field resolved with its PHP and column types. */
export interface FieldDef {
  name: string;
  type: FieldType;
  required: boolean;
  validation?: string;
  phpType: string;
  columnType: string;
  nullable: boolean;
}

/** Resource context, shared by all templates. */
export interface ResourceContext {
  resourceName: string;
  className: string;
  snakeName: string;
  kebabName: string;
  tableName: string;
  fields: FieldDef[];
}

/**
 * Contract of the framework's native migration runner.
 * The default implementation (`PhpMigrationExecutor`) invokes the runner
 * configured by the project profile (spec: `php bin/migrate`,
 * ci4: `php spark migrate`) inside APP_ROOT.
 */
export interface MigrationExecutor {
  execute(
    direction: "up" | "down",
    migrationName: string | null,
    appRoot: string,
  ): Promise<{ executed: string[] }>;
}

/** Injectable dependencies for every tool (deterministic and safe tests). */
export interface ToolDeps {
  appRoot: string;
  now: () => Date;
  rateLimitPerMinute: number;
  rateLimiter: RateLimiter;
  migrationExecutor: MigrationExecutor;
  conventions: ProjectConventions;
}

/* ------------------------------------------------------------------ */
/* Project conventions (`.codeigniter-mcp.json`)                       */
/* ------------------------------------------------------------------ */

export type FrameworkProfile = "spec" | "ci4";

export interface MigrationCommands {
  /** Full argv (e.g. ["php", "bin/migrate", "up"]). */
  up: string[];
  /** Full argv (e.g. ["php", "bin/migrate", "down"]). */
  down: string[];
  /** Whether an optional migrationName is appended as a final argument. */
  appendName: boolean;
}

export interface ProjectConventions {
  framework: FrameworkProfile;
  methodCase: "camelCase" | "snake_case";
  requireStrictTypes: boolean;
  /** Suffix appended to the class/file name of a controller. "" for CI4. */
  controllerSuffix: string;
  migration: MigrationCommands;
}

/** Name of the optional per-project conventions file at APP_ROOT. */
export const PROJECT_CONVENTIONS_FILE = ".codeigniter-mcp.json";

/** Built-in contract (default): the spec's CodeIgniter-style framework. */
export const SPEC_CONVENTIONS: ProjectConventions = {
  framework: "spec",
  methodCase: "camelCase",
  requireStrictTypes: true,
  controllerSuffix: "Controller",
  migration: {
    up: ["php", "bin/migrate", "up"],
    down: ["php", "bin/migrate", "down"],
    appendName: true,
  },
};

/** CodeIgniter 4 native profile. */
const CI4_CONVENTIONS: ProjectConventions = {
  framework: "ci4",
  methodCase: "snake_case",
  requireStrictTypes: false,
  controllerSuffix: "",
  migration: {
    up: ["php", "spark", "migrate"],
    down: ["php", "spark", "migrate:rollback"],
    appendName: false,
  },
};

/**
 * Reads `.codeigniter-mcp.json` from APP_ROOT (if present) and merges it with
 * the profile defaults. A missing file means the default "spec" profile.
 * Invalid content throws `ValidationError` so the server starts loudly.
 */
export function loadProjectConventions(appRoot: string): ProjectConventions {
  const file = resolve(appRoot, PROJECT_CONVENTIONS_FILE);
  if (!existsSync(file)) {
    return SPEC_CONVENTIONS;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new ValidationError(
      `${PROJECT_CONVENTIONS_FILE} is not valid JSON at APP_ROOT.`,
    );
  }

  const parsed = ProjectConventionsFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      `${PROJECT_CONVENTIONS_FILE} is invalid: ${parsed.error.issues[0]?.message}`,
    );
  }

  const base =
    parsed.data.framework === "ci4" ? CI4_CONVENTIONS : SPEC_CONVENTIONS;
  return {
    ...base,
    methodCase: parsed.data.methodCase ?? base.methodCase,
    requireStrictTypes:
      parsed.data.requireStrictTypes ?? base.requireStrictTypes,
  };
}

/** Field type → PHP type mapping. */
export const FIELD_TYPE_TO_PHP: Record<FieldType, string> = {
  string: "string",
  int: "int",
  float: "float",
  boolean: "bool",
  date: "string",
  text: "string",
};

/** Field type → migration column type mapping. */
export const FIELD_TYPE_TO_COLUMN: Record<FieldType, string> = {
  string: "VARCHAR(255)",
  int: "INT",
  float: "FLOAT",
  boolean: "TINYINT(1)",
  date: "DATE",
  text: "TEXT",
};

/** Sample value per type (used by generated tests). */
export const FIELD_TYPE_TO_SAMPLE: Record<FieldType, string> = {
  string: "'Sample'",
  int: "42",
  float: "12.34",
  boolean: "true",
  date: "'2026-01-01'",
  text: "'Sample text'",
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** `OrderItem` → `order_item`. */
export function pascalToSnake(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/** `OrderItem` → `order-item`. */
export function pascalToKebab(name: string): string {
  return pascalToSnake(name).replace(/_/g, "-");
}

/** `order_item` → `OrderItem`. */
export function snakeToPascal(snake: string): string {
  return snake
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** Basic English pluralization (deterministic for scaffolding). */
export function pluralizeWord(snake: string): string {
  if (/(s|x|z|ch|sh)$/i.test(snake)) {
    return `${snake}es`;
  }
  if (/[^aeiou]y$/i.test(snake)) {
    return `${snake.slice(0, -1)}ies`;
  }
  return `${snake}s`;
}

/** `OrderItem` → `order_items` (table name). */
export function toTableName(resourceName: string): string {
  return pluralizeWord(pascalToSnake(resourceName));
}

/** `2026-08-12T...` → `2026_08_12` (migration suffix). */
export function migrationTimestamp(date: Date): string {
  return `${date.getFullYear()}_${pad2(date.getMonth() + 1)}_${pad2(date.getDate())}`;
}

/** `2026-08-12T10:30:05Z` → `2026-08-12-103005` (CI4 migration suffix, UTC = deterministic). */
export function ci4MigrationTimestamp(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())}-${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}`;
}

/** Resolves fields with their PHP/column types already mapped. */
export function resolveFields(fields: FieldInput[]): FieldDef[] {
  return fields.map((field) => {
    const phpType = FIELD_TYPE_TO_PHP[field.type];
    const columnType = FIELD_TYPE_TO_COLUMN[field.type];
    const required = field.required ?? true;
    return {
      name: field.name,
      type: field.type,
      required,
      validation: field.validation,
      phpType,
      columnType,
      nullable: !required,
    };
  });
}

/**
 * Builds the resource context from its name and fields.
 * Defense in depth: re-validates the name even though it already passed Zod.
 * Note: `fields` may be empty for tools that do not require it
 * (scaffold_controller, scaffold_service); tools that do require it
 * validate `.min(1)` at the schema level.
 */
export function buildResourceContext(
  resourceName: string,
  fields: FieldInput[],
): ResourceContext {
  if (!/^[A-Z][a-zA-Z]*$/.test(resourceName)) {
    throw new ValidationError(
      "resourceName must be PascalCase (e.g. Product, OrderItem).",
    );
  }
  return {
    resourceName,
    className: resourceName,
    snakeName: pascalToSnake(resourceName),
    kebabName: pascalToKebab(resourceName),
    tableName: toTableName(resourceName),
    fields: resolveFields(fields),
  };
}

/**
 * Resolves a path and guarantees it stays INSIDE APP_ROOT.
 * Prevents path traversal (`../`, arbitrary absolute paths). Throws
 * `ValidationError` if it tries to escape the project directory.
 */
export function resolveInAppRoot(appRoot: string, ...segments: string[]): string {
  const base = resolve(appRoot);
  const candidate = resolve(base, ...segments);
  if (candidate !== base && !candidate.startsWith(`${base}${sep}`)) {
    throw new ValidationError(
      `Path outside APP_ROOT is not allowed: ${segments.join("/")}`,
    );
  }
  return candidate;
}

/** Converts an absolute path to an APP_ROOT-relative path with `/` separators. */
export function toRelativePath(appRoot: string, absPath: string): string {
  return relative(appRoot, absPath).split(sep).join("/");
}

export interface CreateToolDepsOptions {
  appRoot?: string;
  now?: () => Date;
  rateLimitPerMinute?: number;
  migrationExecutor?: MigrationExecutor;
  conventions?: ProjectConventions;
  env?: Record<string, string | undefined>;
}

/** Builds `ToolDeps` from options (by default: env). */
export function createToolDeps(options: CreateToolDepsOptions = {}): ToolDeps {
  const env = options.env ?? (process.env as Record<string, string | undefined>);
  const rawRoot = options.appRoot ?? env.APP_ROOT;
  if (!rawRoot) {
    throw new Error(
      "APP_ROOT is not defined. Set it in mcp.json (env) or pass an explicit appRoot.",
    );
  }
  const appRoot = resolve(rawRoot);
  if (!existsSync(appRoot) || !statSync(appRoot).isDirectory()) {
    throw new Error(`APP_ROOT does not exist or is not a directory: ${rawRoot}`);
  }

  const rawRate = options.rateLimitPerMinute ?? env.RATE_LIMIT_PER_MINUTE;
  const rateLimitPerMinute = rawRate === undefined
    ? DEFAULT_RATE_LIMIT_PER_MINUTE
    : Number.parseInt(String(rawRate), 10);
  if (!Number.isFinite(rateLimitPerMinute) || rateLimitPerMinute <= 0) {
    throw new Error(
      `Invalid RATE_LIMIT_PER_MINUTE: ${rawRate} (must be a positive integer).`,
    );
  }

  const conventions = options.conventions ?? loadProjectConventions(appRoot);

  return {
    appRoot,
    now: options.now ?? (() => new Date()),
    rateLimitPerMinute,
    rateLimiter: new RateLimiter(rateLimitPerMinute),
    migrationExecutor:
      options.migrationExecutor ?? new PhpMigrationExecutor(conventions.migration),
    conventions,
  };
}

/** Compatibility alias: builds deps from `process.env`. */
export function createToolDepsFromEnv(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): ToolDeps {
  return createToolDeps({ env });
}
