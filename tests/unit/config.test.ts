import { resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildResourceContext,
  FIELD_TYPE_TO_COLUMN,
  FIELD_TYPE_TO_PHP,
  migrationTimestamp,
  pascalToKebab,
  pascalToSnake,
  pluralizeWord,
  resolveInAppRoot,
  toTableName,
} from "../../src/core/config.js";
import { ValidationError } from "../../src/core/errors.js";
import { FIXED_DATE } from "../helpers.js";

describe("naming (framework conventions)", () => {
  it("pascalToSnake", () => {
    expect(pascalToSnake("Product")).toBe("product");
    expect(pascalToSnake("OrderItem")).toBe("order_item");
    expect(pascalToSnake("ProductController")).toBe("product_controller");
  });

  it("pascalToKebab", () => {
    expect(pascalToKebab("OrderItem")).toBe("order-item");
  });

  it("pluralizeWord (basic English pluralization)", () => {
    expect(pluralizeWord("product")).toBe("products");
    expect(pluralizeWord("category")).toBe("categories");
    expect(pluralizeWord("box")).toBe("boxes");
    expect(pluralizeWord("bus")).toBe("buses");
    expect(pluralizeWord("dish")).toBe("dishes");
    expect(pluralizeWord("status")).toBe("statuses");
  });

  it("toTableName", () => {
    expect(toTableName("Product")).toBe("products");
    expect(toTableName("OrderItem")).toBe("order_items");
  });

  it("migrationTimestamp uses the spec YYYY_MM_DD format", () => {
    expect(migrationTimestamp(FIXED_DATE)).toBe("2026_08_12");
  });
});

describe("field type mapping", () => {
  it("maps all types to PHP and to column", () => {
    expect(FIELD_TYPE_TO_PHP.string).toBe("string");
    expect(FIELD_TYPE_TO_PHP.int).toBe("int");
    expect(FIELD_TYPE_TO_PHP.float).toBe("float");
    expect(FIELD_TYPE_TO_PHP.boolean).toBe("bool");
    expect(FIELD_TYPE_TO_PHP.date).toBe("string");
    expect(FIELD_TYPE_TO_PHP.text).toBe("string");

    expect(FIELD_TYPE_TO_COLUMN.string).toBe("VARCHAR(255)");
    expect(FIELD_TYPE_TO_COLUMN.int).toBe("INT");
    expect(FIELD_TYPE_TO_COLUMN.boolean).toBe("TINYINT(1)");
    expect(FIELD_TYPE_TO_COLUMN.text).toBe("TEXT");
  });

  it("buildResourceContext resolves fields with nullable and types", () => {
    const ctx = buildResourceContext("Product", [
      { name: "title", type: "string", required: true },
      { name: "description", type: "text", required: false },
    ]);
    expect(ctx.tableName).toBe("products");
    expect(ctx.kebabName).toBe("product");
    expect(ctx.fields[0]).toMatchObject({
      name: "title",
      phpType: "string",
      columnType: "VARCHAR(255)",
      nullable: false,
    });
    expect(ctx.fields[1]).toMatchObject({ nullable: true });
  });

  it("rejects a resourceName that is not PascalCase (defense in depth)", () => {
    expect(() => buildResourceContext("product", [])).toThrow(ValidationError);
    expect(() => buildResourceContext("order_item", [])).toThrow(ValidationError);
  });
});

describe("resolveInAppRoot (path traversal)", () => {
  const appRoot = "C:/proyecto/mi-framework";

  it("accepts internal paths", () => {
    const resolved = resolveInAppRoot(appRoot, "app", "Controllers");
    // Windows normalizes to backslashes: we compare against resolve() + sep.
    expect(resolved.startsWith(resolve(appRoot) + sep)).toBe(true);
    expect(resolved).toBe(resolve(appRoot, "app", "Controllers"));
  });

  it("throws ValidationError on path traversal", () => {
    expect(() => resolveInAppRoot(appRoot, "..", "etc")).toThrow(ValidationError);
    expect(() => resolveInAppRoot(appRoot, "../../../../Windows")).toThrow(
      ValidationError,
    );
  });
});
