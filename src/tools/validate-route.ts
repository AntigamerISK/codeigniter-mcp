/**
 * Tool 3 — `validate_route` (spec section 2).
 *
 * Read-only: reads `app/Config/Routes.php` and NEVER modifies it.
 * Detects:
 * - Exact collision (same method + path).
 * - Pattern collision (`/products/{id}` vs `/products/{slug}`).
 * - Path shape errors (unbalanced braces, invalid parameters).
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  resolveInAppRoot,
  type ToolDeps,
} from "../core/config.js";
import { handleToolCall, type ToolResult } from "../core/errors.js";
import { readFileIfExists } from "../core/fs-safe.js";
import { ValidateRouteInput } from "../schemas/validate-route.schema.js";

export interface RouteEntry {
  method: string;
  path: string;
}

export interface RouteConflict {
  existingMethod: string;
  existingPath: string;
  reason: string;
}

export interface ValidateRoutePayload {
  valid: boolean;
  conflicts: RouteConflict[];
  suggestions: string[];
}

const ROUTE_PATTERN_SOURCE = "->(get|post|put|patch|delete)\\s*\\(\\s*['\"]([^'\"]+)['\"]";

/**
 * Extracts the registered routes from the Routes.php content.
 * Supported format: `$routes->get('/products/{id}', 'ProductController::show');`
 * Deduplicates by `method + path` (a route registered twice is one entry).
 */
export function parseRoutes(content: string): RouteEntry[] {
  const regex = new RegExp(ROUTE_PATTERN_SOURCE, "gi");
  const seen = new Set<string>();
  const routes: RouteEntry[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const method = match[1]!.toUpperCase();
    const path = match[2]!;
    const key = `${method} ${path}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    routes.push({ method, path });
  }
  return routes;
}

/** `{param}` → `*` to compare the structural shape of a route. */
export function normalizeRoutePattern(path: string): string {
  return path.replace(/\{[^}]+\}/g, "*");
}

/** Validates the path shape: balanced braces and valid parameter names. */
export function validatePathShape(path: string): { ok: boolean; message?: string } {
  const opens = (path.match(/\{/g) ?? []).length;
  const closes = (path.match(/\}/g) ?? []).length;
  if (opens !== closes) {
    return { ok: false, message: "Unbalanced { } braces in the path." };
  }
  const paramPattern = /\{([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = paramPattern.exec(path)) !== null) {
    const name = match[1]!;
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(name)) {
      return {
        ok: false,
        message: `Invalid parameter name: {${name}}. Use camelCase, e.g. {productId}.`,
      };
    }
  }
  return { ok: true };
}

/** Detects conflicts of the new route against the registered ones. */
export function findConflicts(
  method: string,
  path: string,
  existing: RouteEntry[],
): RouteConflict[] {
  const conflicts: RouteConflict[] = [];
  const newPattern = normalizeRoutePattern(path);

  for (const route of existing) {
    if (route.method !== method) {
      continue;
    }
    if (route.path === path) {
      conflicts.push({
        existingMethod: route.method,
        existingPath: route.path,
        reason: "Exact duplicate route (same method and path).",
      });
    } else if (normalizeRoutePattern(route.path) === newPattern) {
      conflicts.push({
        existingMethod: route.method,
        existingPath: route.path,
        reason: "Pattern collision: the route shares its structure with a different {param}.",
      });
    }
  }
  return conflicts;
}

function buildSuggestions(
  method: string,
  path: string,
  conflicts: RouteConflict[],
): string[] {
  if (conflicts.length === 0) {
    return [`The route ${method} ${path} does not collide with the registered routes.`];
  }
  return conflicts.map((conflict) => {
    if (conflict.reason.startsWith("Exact duplicate route")) {
      return (
        `Remove or modify the existing route ${conflict.existingMethod} ${conflict.existingPath}, ` +
        "or use a different path."
      );
    }
    return (
      `Differentiate the literal path to disambiguate, e.g. add a fixed segment ` +
      `(${path} with a prefix like /catalog) instead of ${conflict.existingPath}.`
    );
  });
}

export async function validateRoute(
  input: unknown,
  deps: ToolDeps,
): Promise<ToolResult<ValidateRoutePayload>> {
  return handleToolCall(async () => {
    const parsed = ValidateRouteInput.parse(input);

    const shape = validatePathShape(parsed.path);
    if (!shape.ok) {
      return {
        valid: false,
        conflicts: [],
        suggestions: [shape.message!],
      };
    }

    const routesFile = resolveInAppRoot(deps.appRoot, "app", "Config", "Routes.php");
    const content = readFileIfExists(routesFile);

    if (content === null) {
      return {
        valid: true,
        conflicts: [],
        suggestions: [
          "app/Config/Routes.php does not exist; collisions against registered routes could not be verified.",
        ],
      };
    }

    const existing = parseRoutes(content);
    const conflicts = findConflicts(parsed.method, parsed.path, existing);

    return {
      valid: conflicts.length === 0,
      conflicts,
      suggestions: buildSuggestions(parsed.method, parsed.path, conflicts),
    };
  });
}

export function registerValidateRoute(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "validate_route",
    {
      title: "Validate a route against Routes.php",
      description:
        "Verifies (read-only) that a route does not collide with the routes registered in app/Config/Routes.php " +
        "and follows the framework's kebab-case {param} syntax. Never modifies files.",
      inputSchema: ValidateRouteInput,
    },
    async (args) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await validateRoute(args, deps), null, 2),
        },
      ],
    }),
  );
}
