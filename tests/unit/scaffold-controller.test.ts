import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scaffoldController } from "../../src/tools/scaffold-controller.js";
import { writeInAppRoot, createTestContext } from "../helpers.js";

const PRODUCT = { resourceName: "Product", methods: ["index", "store"] };

describe("scaffold_controller", () => {
  it("happy path: generates the controller and writes the file", async () => {
    const { root, deps, cleanup } = createTestContext();
    try {
      const result = await scaffoldController(PRODUCT, deps);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.filePath).toBe("app/Controllers/ProductController.php");
      expect(result.written).toBe(true);

      const absPath = join(root, "app", "Controllers", "ProductController.php");
      expect(existsSync(absPath)).toBe(true);
      const content = readFileSync(absPath, "utf8");
      expect(content).toContain("class ProductController");
      expect(content).toContain("declare(strict_types=1);");
      expect(content).toContain("public function index()");
      expect(content).toContain("public function store(");
      expect(content).not.toContain("public function show(");
      expect(content).not.toContain("public function update(");
      // Hard rule: the controller only calls the Service, zero SQL.
      expect(content).toContain("$this->service->getAll()");
      expect(content).not.toMatch(/\bSELECT\b/);
    } finally {
      cleanup();
    }
  });

  it("invalid input: lowercase resourceName returns a typed error, no exception", async () => {
    const { deps, cleanup } = createTestContext();
    try {
      const result = await scaffoldController({ resourceName: "product" }, deps);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.type).toBe("ValidationError");
      expect(result.error.message).toContain("PascalCase");
    } finally {
      cleanup();
    }
  });

  it("invalid input: method outside the enum returns a typed error", async () => {
    const { deps, cleanup } = createTestContext();
    try {
      const result = await scaffoldController(
        { resourceName: "Product", methods: ["deleteAll"] },
        deps,
      );
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.type).toBe("ValidationError");
    } finally {
      cleanup();
    }
  });

  it("destructive without confirmation: overwrite=false does NOT modify the existing file", async () => {
    const { root, deps, cleanup } = createTestContext();
    try {
      writeInAppRoot(
        root,
        "app/Controllers/ProductController.php",
        "<?php\n// previous manual content\n",
      );
      const result = await scaffoldController(PRODUCT, deps);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.written).toBe(false);
      expect(result.warnings.some((w) => w.includes("not modified"))).toBe(true);
      const content = readFileSync(
        join(root, "app", "Controllers", "ProductController.php"),
        "utf8",
      );
      expect(content).toContain("previous manual content");
    } finally {
      cleanup();
    }
  });

  it("overwrite=true rewrites the existing file", async () => {
    const { root, deps, cleanup } = createTestContext();
    try {
      writeInAppRoot(
        root,
        "app/Controllers/ProductController.php",
        "<?php\n// previous manual content\n",
      );
      const result = await scaffoldController({ ...PRODUCT, overwrite: true }, deps);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.written).toBe(true);
      const content = readFileSync(
        join(root, "app", "Controllers", "ProductController.php"),
        "utf8",
      );
      expect(content).toContain("class ProductController");
      expect(content).not.toContain("previous manual content");
    } finally {
      cleanup();
    }
  });

  it("empty methods generates a controller without REST methods", async () => {
    const { root, deps, cleanup } = createTestContext();
    try {
      const result = await scaffoldController(
        { resourceName: "Product", methods: [] },
        deps,
      );
      expect(result.success).toBe(true);
      if (!result.success) return;
      const content = readFileSync(
        join(root, "app", "Controllers", "ProductController.php"),
        "utf8",
      );
      expect(content).toContain("class ProductController");
      expect(content).not.toMatch(/public function (index|show|store|update|destroy)/);
    } finally {
      cleanup();
    }
  });
});
