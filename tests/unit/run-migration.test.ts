import { describe, expect, it } from "vitest";
import { runMigration } from "../../src/tools/run-migration.js";
import { createTestContext, writeInAppRoot, mkdirInAppRoot } from "../helpers.js";

describe("run_migration", () => {
  it("HARD RULE: confirm=false → DestructiveOpBlockedError and ZERO executions", async () => {
    const { root, deps, executor, cleanup } = createTestContext();
    try {
      // If a "pending" migration exists it must not be touched.
      mkdirInAppRoot(root, "app/Database/Migrations");
      writeInAppRoot(
        root,
        "app/Database/Migrations/2026_08_12_create_products_table.php",
        "<?php\n// migration\n",
      );

      const result = await runMigration({ direction: "up", confirm: false }, deps);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.type).toBe("DestructiveOpBlockedError");
      // Zero queries: the executor (and therefore the PHP/DB runner) is never invoked.
      expect(executor.calls).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it("confirm=true executes all pending migrations (migrationName omitted)", async () => {
    const { root, deps, executor, cleanup } = createTestContext();
    try {
      executor.result = {
        executed: [
          "app/Database/Migrations/2026_08_12_create_products_table.php",
        ],
      };
      const result = await runMigration({ direction: "up", confirm: true }, deps);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.executed).toEqual([
        "app/Database/Migrations/2026_08_12_create_products_table.php",
      ]);
      expect(executor.calls).toHaveLength(1);
      expect(executor.calls[0]).toMatchObject({
        direction: "up",
        migrationName: null,
        appRoot: root,
      });
    } finally {
      cleanup();
    }
  });

  it("confirm=true with a valid migrationName executes that migration", async () => {
    const { root, deps, executor, cleanup } = createTestContext();
    try {
      mkdirInAppRoot(root, "app/Database/Migrations");
      writeInAppRoot(
        root,
        "app/Database/Migrations/2026_08_12_create_products_table.php",
        "<?php\n// migration\n",
      );
      executor.result = {
        executed: ["app/Database/Migrations/2026_08_12_create_products_table.php"],
      };

      const result = await runMigration(
        { direction: "down", migrationName: "2026_08_12_create_products_table", confirm: true },
        deps,
      );
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(executor.calls[0]!.migrationName).toBe(
        "2026_08_12_create_products_table.php",
      );
    } finally {
      cleanup();
    }
  });

  it("confirm=true with a missing migrationName → ValidationError without executing", async () => {
    const { root, deps, executor, cleanup } = createTestContext();
    try {
      mkdirInAppRoot(root, "app/Database/Migrations");
      const result = await runMigration(
        { direction: "up", migrationName: "no_existe", confirm: true },
        deps,
      );
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.type).toBe("ValidationError");
      expect(executor.calls).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it("migrationName with path traversal → rejected by the schema (ValidationError)", async () => {
    const { deps, executor, cleanup } = createTestContext();
    try {
      const result = await runMigration(
        { direction: "up", migrationName: "../../etc/passwd", confirm: true },
        deps,
      );
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.type).toBe("ValidationError");
      expect(executor.calls).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it("invalid input: missing confirm → ValidationError", async () => {
    const { deps, cleanup } = createTestContext();
    try {
      const result = await runMigration({ direction: "up" }, deps);
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.type).toBe("ValidationError");
    } finally {
      cleanup();
    }
  });

  it("rate limit: consumes a token after confirm=true", async () => {
    const { deps, cleanup } = createTestContext({ rateLimitPerMinute: 1 });
    try {
      const first = await runMigration({ direction: "up", confirm: true }, deps);
      expect(first.success).toBe(true);
      const second = await runMigration({ direction: "up", confirm: true }, deps);
      expect(second.success).toBe(false);
      if (second.success) return;
      expect(second.error.type).toBe("RateLimitExceededError");
    } finally {
      cleanup();
    }
  });
});
