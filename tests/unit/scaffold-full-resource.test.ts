import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scaffoldFullResource } from "../../src/tools/scaffold-full-resource.js";
import { createTestContext } from "../helpers.js";

const PRODUCT_INPUT = {
  resourceName: "Product",
  fields: [
    { name: "title", type: "string", required: true, validation: "max:255" },
    { name: "price", type: "float", required: true },
    { name: "description", type: "text", required: false },
  ],
  withTests: true,
  withRepository: true,
  overwrite: false,
};

const EXPECTED_FILES = [
  "app/Controllers/ProductController.php",
  "app/Services/ProductService.php",
  "app/Repositories/ProductRepositoryInterface.php",
  "app/Repositories/ProductRepository.php",
  "app/Entities/Product.php",
  "app/Database/Migrations/2026_08_12_create_products_table.php",
  "tests/Unit/ProductServiceTest.php",
  "tests/Integration/ProductControllerTest.php",
];

describe("scaffold_full_resource", () => {
  it("happy path: generates the full CRUD in the spec order", async () => {
    const { root, deps, cleanup } = createTestContext();
    try {
      const result = await scaffoldFullResource(PRODUCT_INPUT, deps);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.filesCreated).toEqual(EXPECTED_FILES);
      expect(result.filesSkipped).toEqual([]);

      for (const rel of EXPECTED_FILES) {
        expect(existsSync(join(root, ...rel.split("/"))), rel).toBe(true);
      }

      // El controller no contiene SQL.
      const controller = readFileSync(
        join(root, "app", "Controllers", "ProductController.php"),
        "utf8",
      );
      expect(controller).not.toMatch(/\bSELECT\b/);
    } finally {
      cleanup();
    }
  });

  it("determinism: two runs with the same input generate identical output", async () => {
    const { root, deps, cleanup } = createTestContext();
    try {
      const first = await scaffoldFullResource(PRODUCT_INPUT, deps);
      expect(first.success).toBe(true);

      // Second run: files already exist → all skipped (without overwrite).
      const second = await scaffoldFullResource(PRODUCT_INPUT, deps);
      expect(second.success).toBe(true);
      if (!second.success || !first.success) return;
      expect(second.filesCreated).toEqual([]);
      expect(second.filesSkipped).toEqual(EXPECTED_FILES);
    } finally {
      cleanup();
    }
  });

  it("collision with overwrite=true: rewrites and nothing is skipped", async () => {
    const { root, deps, cleanup } = createTestContext();
    try {
      const first = await scaffoldFullResource(PRODUCT_INPUT, deps);
      expect(first.success).toBe(true);

      const second = await scaffoldFullResource(
        { ...PRODUCT_INPUT, overwrite: true },
        deps,
      );
      expect(second.success).toBe(true);
      if (!second.success) return;
      expect(second.filesCreated).toEqual(EXPECTED_FILES);
      expect(second.filesSkipped).toEqual([]);
    } finally {
      cleanup();
    }
  });

  it("invalid input: without fields returns a typed error (ValidationError)", async () => {
    const { deps, cleanup } = createTestContext();
    try {
      const result = await scaffoldFullResource(
        { resourceName: "Product", fields: [] },
        deps,
      );
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.type).toBe("ValidationError");
    } finally {
      cleanup();
    }
  });

  it("invalid input: invalid resourceName returns a typed error", async () => {
    const { deps, cleanup } = createTestContext();
    try {
      const result = await scaffoldFullResource(
        { resourceName: "product", fields: [{ name: "title", type: "string" }] },
        deps,
      );
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.type).toBe("ValidationError");
    } finally {
      cleanup();
    }
  });

  it("withRepository=false: no genera repositorios ni test unitario y avisa", async () => {
    const { root, deps, cleanup } = createTestContext();
    try {
      const result = await scaffoldFullResource(
        { ...PRODUCT_INPUT, withRepository: false },
        deps,
      );
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.filesCreated).toContain("app/Controllers/ProductController.php");
      expect(result.filesCreated).toContain("app/Services/ProductService.php");
      expect(result.filesCreated).toContain("app/Entities/Product.php");
      expect(result.filesCreated).not.toContain(
        "app/Repositories/ProductRepositoryInterface.php",
      );
      expect(result.filesCreated).not.toContain("tests/Unit/ProductServiceTest.php");
      expect(result.warnings.some((w) => w.includes("withRepository=false"))).toBe(true);
      expect(result.warnings.some((w) => w.includes("unit test"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("withTests=false: does not generate tests", async () => {
    const { deps, cleanup } = createTestContext();
    try {
      const result = await scaffoldFullResource(
        { ...PRODUCT_INPUT, withTests: false },
        deps,
      );
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.filesCreated.some((f) => f.includes("tests/"))).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("generates PHP code with declare(strict_types=1) in every file", async () => {
    const { root, deps, cleanup } = createTestContext();
    try {
      const result = await scaffoldFullResource(PRODUCT_INPUT, deps);
      expect(result.success).toBe(true);
      for (const rel of EXPECTED_FILES) {
        const content = readFileSync(join(root, ...rel.split("/")), "utf8");
        expect(content, rel).toContain("declare(strict_types=1);");
      }
    } finally {
      cleanup();
    }
  });

  it("rate limit: consumes a token (heavy write tool)", async () => {
    const { deps, cleanup } = createTestContext({ rateLimitPerMinute: 1 });
    try {
      const first = await scaffoldFullResource(PRODUCT_INPUT, deps);
      expect(first.success).toBe(true);
      const second = await scaffoldFullResource(
        { ...PRODUCT_INPUT, resourceName: "Category" },
        deps,
      );
      expect(second.success).toBe(false);
      if (second.success) return;
      expect(second.error.type).toBe("RateLimitExceededError");
    } finally {
      cleanup();
    }
  });
});
