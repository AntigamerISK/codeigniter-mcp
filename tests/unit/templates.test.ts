import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildResourceContext, type FieldInput } from "../../src/core/config.js";
import { ConventionViolationError } from "../../src/core/errors.js";
import {
  assertNoSqlInController,
  renderControllerTemplate,
} from "../../src/templates/controller.template.js";
import { renderEntityTemplate } from "../../src/templates/entity.template.js";
import { renderMigrationTemplate } from "../../src/templates/migration.template.js";
import {
  renderRepositoryInterfaceTemplate,
  renderRepositoryTemplate,
} from "../../src/templates/repository.template.js";
import {
  parseValidationRules,
  renderServiceTemplate,
} from "../../src/templates/service.template.js";

const FIELDS: FieldInput[] = [
  { name: "title", type: "string", required: true, validation: "max:255" },
  { name: "price", type: "float", required: true },
  { name: "email", type: "string", required: false, validation: "email" },
  { name: "description", type: "text", required: false },
];

const CTX = buildResourceContext("Product", FIELDS);

describe("parseValidationRules", () => {
  it("traduce tokens soportados", () => {
    const { entries, warnings } = parseValidationRules("max:255|min:3|email|required");
    expect(entries).toContain("'max' => 255");
    expect(entries).toContain("'min' => 3");
    expect(entries).toContain("'email' => true");
    expect(warnings).toEqual([]);
  });

  it("warns about unknown tokens without failing", () => {
    const { entries, warnings } = parseValidationRules("max:10|magic");
    expect(entries).toContain("'max' => 10");
    expect(warnings).toContain("Unsupported validation rule: 'magic'");
  });
});

describe("renderServiceTemplate", () => {
  it("generates RULES per field (required + rules)", () => {
    const { content } = renderServiceTemplate(CTX);
    expect(content).toContain("'title' => ['required' => true, 'max' => 255]");
    expect(content).toContain("'price' => ['required' => true]");
    expect(content).toContain("'email' => ['email' => true]");
    expect(content).toContain("'description' => []");
    expect(content).toContain("ProductRepositoryInterface $repository");
  });

  it("uses FILTER_VALIDATE_EMAIL for the email rule", () => {
    const { content } = renderServiceTemplate(CTX);
    expect(content).toContain("\\FILTER_VALIDATE_EMAIL");
  });
});

describe("renderControllerTemplate", () => {
  it("only includes the requested methods", () => {
    const content = renderControllerTemplate(CTX, ["index", "destroy"]);
    expect(content).toContain("public function index()");
    expect(content).toContain("public function destroy(");
    expect(content).not.toContain("public function show(");
    expect(content).not.toContain("public function store(");
  });

  it("no contiene constructos SQL (ni siquiera en docblocks)", () => {
    const content = renderControllerTemplate(CTX, ["index", "show", "store", "update", "destroy"]);
    expect(content).not.toMatch(
      /\bSELECT\b|\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b|\bDELETE\s+FROM\b|\bJOIN\b/i,
    );
  });
});

describe("assertNoSqlInController", () => {
  it("does not throw on the generated controller", () => {
    const content = renderControllerTemplate(CTX, ["index"]);
    expect(() => assertNoSqlInController(content)).not.toThrow();
  });

  it("throws ConventionViolationError when it detects SQL", () => {
    expect(() => assertNoSqlInController("SELECT * FROM products;")).toThrow(
      ConventionViolationError,
    );
    expect(() => assertNoSqlInController("$db->query('DELETE FROM x')")).toThrow(
      ConventionViolationError,
    );
  });
});

describe("renderEntityTemplate", () => {
  it("genera constructor inmutable con id y created_at", () => {
    const content = renderEntityTemplate(CTX);
    expect(content).toContain("final class Product");
    expect(content).toContain("public readonly ?int $id");
    expect(content).toContain("public readonly string $title");
    expect(content).toContain("public readonly ?string $email = null");
    expect(content).toContain("public readonly \\DateTimeImmutable $createdAt");
    expect(content).toContain("public static function fromArray(array $data): self");
  });
});

describe("renderRepositoryTemplate", () => {
  it("generates SQL with prepared statements and the resource columns", () => {
    const content = renderRepositoryTemplate(CTX);
    expect(content).toContain("final class ProductRepository implements ProductRepositoryInterface");
    expect(content).toContain(
      "SELECT id, title, price, email, description, created_at FROM products WHERE id = :id LIMIT 1",
    );
    expect(content).toContain("INSERT INTO products (title, price, email, description, created_at)");
    expect(content).toContain("$this->db->prepare(");
    expect(content).not.toContain("$this->db->query(\"SELECT *");
  });

  it("dynamic UPDATE: only updates the keys present (safe partial updates)", () => {
    const content = renderRepositoryTemplate(CTX);
    expect(content).toContain("foreach (['title', 'price', 'email', 'description'] as $field)");
    expect(content).toContain("\\array_key_exists($field, $data)");
    expect(content).toContain("'UPDATE products SET ' . \\implode(', ', $sets) . ' WHERE id = :id'");
    // No static SET that would overwrite absent fields with NULL.
    expect(content).not.toContain("UPDATE products SET title = :title");
  });

  it("create: safe bindings for optional fields (NULL when absent)", () => {
    const content = renderRepositoryTemplate(CTX);
    expect(content).toContain(
      "isset($data['email']) && $data['email'] !== null ? $data['email'] : null",
    );
    expect(content).toContain(
      "isset($data['description']) && $data['description'] !== null ? $data['description'] : null",
    );
    // Required: direct access (the Service guarantees presence).
    expect(content).toContain("'title' => $data['title'],");
  });

  it("generates the interface with the full contract", () => {
    const content = renderRepositoryInterfaceTemplate(CTX);
    expect(content).toContain("interface ProductRepositoryInterface");
    expect(content).toContain("findById(int $id): ?Product");
    expect(content).toContain("findAll(): array");
    expect(content).toContain("create(array $data): Product");
    expect(content).toContain("delete(int $id): bool");
  });
});

describe("renderMigrationTemplate", () => {
  it("generates deterministic DDL SQL with the columns", () => {
    const content = renderMigrationTemplate(CTX, "2026_08_12");
    expect(content).toContain("final class CreateProductsTable extends Migration");
    expect(content).toContain("CREATE TABLE products (");
    expect(content).toContain("title VARCHAR(255) NOT NULL");
    expect(content).toContain("description TEXT NULL");
    expect(content).toContain("id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY");
    expect(content).toContain("created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP");
    expect(content).toContain("DROP TABLE IF EXISTS products");
  });
});
