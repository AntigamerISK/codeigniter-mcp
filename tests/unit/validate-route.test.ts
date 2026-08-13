import { describe, expect, it } from "vitest";
import {
  findConflicts,
  normalizeRoutePattern,
  parseRoutes,
  validatePathShape,
} from "../../src/tools/validate-route.js";
import { createTestContext, writeInAppRoot } from "../helpers.js";

const ROUTES_CONTENT = `<?php

use App\\Controllers\\ProductController;

$routes->get('/products', 'ProductController::index');
$routes->get('/products/{id}', 'ProductController::show');
$routes->post('/products', 'ProductController::store');
$routes->put('/products/{id}', 'ProductController::update');
$routes->delete('/products/{id}', 'ProductController::destroy');
`;

describe("parseRoutes", () => {
  it("extrae method + path de Routes.php", () => {
    const routes = parseRoutes(ROUTES_CONTENT);
    expect(routes).toContainEqual({ method: "GET", path: "/products" });
    expect(routes).toContainEqual({ method: "GET", path: "/products/{id}" });
    expect(routes).toContainEqual({ method: "POST", path: "/products" });
    expect(routes).toContainEqual({ method: "PUT", path: "/products/{id}" });
    expect(routes).toContainEqual({ method: "DELETE", path: "/products/{id}" });
    expect(routes).toHaveLength(5);
  });

  it("ignores content without routes", () => {
    expect(parseRoutes("<?php\n// no routes\n")).toEqual([]);
  });

  it("deduplicates routes registered twice", () => {
    const duplicated = ROUTES_CONTENT + "\n$routes->get('/products', 'ProductController::index');\n";
    const routes = parseRoutes(duplicated);
    expect(routes.filter((r) => r.method === "GET" && r.path === "/products")).toHaveLength(1);
    expect(routes).toHaveLength(5);
  });
});

describe("normalizeRoutePattern", () => {
  it("replaces {param} with * to compare structure", () => {
    expect(normalizeRoutePattern("/products/{id}")).toBe("/products/*");
    expect(normalizeRoutePattern("/products/{slug}")).toBe("/products/*");
  });
});

describe("validatePathShape", () => {
  it("accepts valid paths", () => {
    expect(validatePathShape("/products/{id}").ok).toBe(true);
    expect(validatePathShape("/api/products/{productId}").ok).toBe(true);
  });

  it("rejects unbalanced braces", () => {
    expect(validatePathShape("/products/{id}").ok).toBe(true);
    expect(validatePathShape("/products/{id").ok).toBe(false);
    expect(validatePathShape("/products/}").ok).toBe(false);
  });

  it("rejects invalid parameter names", () => {
    const result = validatePathShape("/products/{id-con}");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("id-con");
  });
});

describe("findConflicts", () => {
  const existing = [
    { method: "GET", path: "/products/{id}" },
    { method: "GET", path: "/products" },
    { method: "POST", path: "/products" },
  ];

  it("detects an exact duplicate (same method + path)", () => {
    const conflicts = findConflicts("GET", "/products", existing);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ existingPath: "/products" });
    expect(conflicts[0]!.reason).toContain("Exact duplicate route");
  });

  it("detects a pattern collision ({id} vs {slug})", () => {
    const conflicts = findConflicts("GET", "/products/{slug}", existing);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.reason).toContain("Pattern collision");
  });

  it("does not collide when the method differs", () => {
    expect(findConflicts("PUT", "/products", existing)).toEqual([]);
  });

  it("does not collide with routes of a different structure", () => {
    expect(findConflicts("GET", "/categories", existing)).toEqual([]);
  });
});

describe("validate_route (tool end-to-end)", () => {
  it("happy path: route free of conflicts", async () => {
    const { root, deps, cleanup } = createTestContext();
    try {
      writeInAppRoot(root, "app/Config/Routes.php", ROUTES_CONTENT);
      const { validateRoute } = await import("../../src/tools/validate-route.js");
      const result = await validateRoute(
        { method: "POST", path: "/categories" },
        deps,
      );
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.valid).toBe(true);
      expect(result.conflicts).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("detects an exact duplicate against Routes.php", async () => {
    const { root, deps, cleanup } = createTestContext();
    try {
      writeInAppRoot(root, "app/Config/Routes.php", ROUTES_CONTENT);
      const { validateRoute } = await import("../../src/tools/validate-route.js");
      const result = await validateRoute(
        { method: "GET", path: "/products/{id}" },
        deps,
      );
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.valid).toBe(false);
      expect(result.conflicts[0]!.existingMethod).toBe("GET");
      expect(result.suggestions.length).toBeGreaterThan(0);
    } finally {
      cleanup();
    }
  });

  it("no Routes.php: no conflicts possible and it suggests verifying it", async () => {
    const { deps, cleanup } = createTestContext();
    try {
      const { validateRoute } = await import("../../src/tools/validate-route.js");
      const result = await validateRoute({ method: "GET", path: "/products" }, deps);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.valid).toBe(true);
      expect(result.suggestions[0]).toContain("does not exist");
    } finally {
      cleanup();
    }
  });

  it("invalid input: path with uppercase letters returns a typed error", async () => {
    const { deps, cleanup } = createTestContext();
    try {
      const { validateRoute } = await import("../../src/tools/validate-route.js");
      const result = await validateRoute(
        { method: "GET", path: "/Products" },
        deps,
      );
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.type).toBe("ValidationError");
    } finally {
      cleanup();
    }
  });
});
