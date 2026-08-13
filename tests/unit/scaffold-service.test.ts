import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scaffoldService } from "../../src/tools/scaffold-service.js";
import { createTestContext, writeInAppRoot } from "../helpers.js";

describe("scaffold_service", () => {
  it("happy path: generates the Service with RULES and validation", async () => {
    const { root, deps, cleanup } = createTestContext();
    try {
      const result = await scaffoldService({ resourceName: "Product" }, deps);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.filePath).toBe("app/Services/ProductService.php");
      expect(result.written).toBe(true);

      const content = readFileSync(
        join(root, "app", "Services", "ProductService.php"),
        "utf8",
      );
      expect(content).toContain("class ProductService");
      expect(content).toContain("ProductRepositoryInterface $repository");
      expect(content).toContain("private const RULES");
      expect(content).toContain("private function validate(");
      expect(content).toContain("\\InvalidArgumentException");
    } finally {
      cleanup();
    }
  });

  it("contract first: warns if the repository interface does not exist", async () => {
    const { deps, cleanup } = createTestContext();
    try {
      const result = await scaffoldService({ resourceName: "Product" }, deps);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.warnings.some((w) => w.includes("RepositoryInterface"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("no avisa si la interfaz del repositorio ya existe", async () => {
    const { root, deps, cleanup } = createTestContext();
    try {
      writeInAppRoot(
        root,
        "app/Repositories/ProductRepositoryInterface.php",
        "<?php\n// existing interface\n",
      );
      const result = await scaffoldService({ resourceName: "Product" }, deps);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.warnings.some((w) => w.includes("RepositoryInterface"))).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("invalid input: invalid resourceName returns a typed error", async () => {
    const { deps, cleanup } = createTestContext();
    try {
      const result = await scaffoldService({ resourceName: "Product " }, deps);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.type).toBe("ValidationError");
    } finally {
      cleanup();
    }
  });

  it("destructive without confirmation: does not overwrite an existing file", async () => {
    const { root, deps, cleanup } = createTestContext();
    try {
      writeInAppRoot(
        root,
        "app/Services/ProductService.php",
        "<?php\n// manual\n",
      );
      const result = await scaffoldService({ resourceName: "Product" }, deps);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.written).toBe(false);
      const content = readFileSync(
        join(root, "app", "Services", "ProductService.php"),
        "utf8",
      );
      expect(content).toBe("<?php\n// manual\n");
    } finally {
      cleanup();
    }
  });
});
