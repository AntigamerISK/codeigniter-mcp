import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scaffoldRepository } from "../../src/tools/scaffold-repository.js";
import { createTestContext, writeInAppRoot } from "../helpers.js";

const FIELDS = [{ name: "title", type: "string" }];

describe("scaffold_repository", () => {
  it("happy path: ALWAYS generates interface + implementation together", async () => {
    const { root, deps, cleanup } = createTestContext();
    try {
      const result = await scaffoldRepository(
        { resourceName: "Product", fields: FIELDS },
        deps,
      );
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.filesCreated).toEqual([
        "app/Repositories/ProductRepositoryInterface.php",
        "app/Repositories/ProductRepository.php",
      ]);

      const iface = readFileSync(
        join(root, "app", "Repositories", "ProductRepositoryInterface.php"),
        "utf8",
      );
      const impl = readFileSync(
        join(root, "app", "Repositories", "ProductRepository.php"),
        "utf8",
      );
      expect(iface).toContain("interface ProductRepositoryInterface");
      expect(impl).toContain("final class ProductRepository implements ProductRepositoryInterface");
      // Prepared statements: SQL injection safe.
      expect(impl).toContain("$this->db->prepare(");
      expect(impl).not.toContain("$this->db->query(\"SELECT * FROM products WHERE title = '");
    } finally {
      cleanup();
    }
  });

  it("invalid input: without fields returns a typed error (ValidationError)", async () => {
    const { deps, cleanup } = createTestContext();
    try {
      const result = await scaffoldRepository(
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

  it("invalid input: invalid field name returns a typed error", async () => {
    const { deps, cleanup } = createTestContext();
    try {
      const result = await scaffoldRepository(
        { resourceName: "Product", fields: [{ name: "Title", type: "string" }] },
        deps,
      );
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.type).toBe("ValidationError");
    } finally {
      cleanup();
    }
  });

  it("collision: does not overwrite without overwrite and reports it in warnings", async () => {
    const { root, deps, cleanup } = createTestContext();
    try {
      writeInAppRoot(
        root,
        "app/Repositories/ProductRepositoryInterface.php",
        "<?php\n// manual\n",
      );
      const result = await scaffoldRepository(
        { resourceName: "Product", fields: FIELDS },
        deps,
      );
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.filesCreated).toEqual([
        "app/Repositories/ProductRepository.php",
      ]);
      expect(result.warnings.some((w) => w.includes("RepositoryInterface"))).toBe(true);
      const iface = readFileSync(
        join(root, "app", "Repositories", "ProductRepositoryInterface.php"),
        "utf8",
      );
      expect(iface).toBe("<?php\n// manual\n");
    } finally {
      cleanup();
    }
  });

  it("rate limit: consumes a token (heavy write tool)", async () => {
    const { deps, cleanup } = createTestContext({ rateLimitPerMinute: 1 });
    try {
      const first = await scaffoldRepository(
        { resourceName: "Product", fields: FIELDS },
        deps,
      );
      expect(first.success).toBe(true);
      const second = await scaffoldRepository(
        { resourceName: "Category", fields: FIELDS },
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
