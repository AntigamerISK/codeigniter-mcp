/**
 * PHP Repository templates (spec: Tool 2c).
 *
 * - ALWAYS generated together: interface (contract) + implementation (adapter).
 * - There is no implementation without a contract.
 * - The implementation uses PDO with prepared statements (SQL-injection safe).
 */

import type { ResourceContext } from "../core/config.js";

function columnList(ctx: ResourceContext): string {
  return ["id", ...ctx.fields.map((f) => f.name), "created_at"].join(", ");
}

function insertColumns(ctx: ResourceContext): string {
  return [...ctx.fields.map((f) => f.name), "created_at"].join(", ");
}

function insertPlaceholders(ctx: ResourceContext): string {
  return [...ctx.fields.map((f) => `:${f.name}`), ":created_at"].join(", ");
}

/**
 * Safe bindings for INSERT:
 * - Required fields: direct access (the Service guarantees their presence).
 * - Optional fields: `isset` + conditional cast → NULL when absent
 *   (avoids the PHP 8.x "Undefined array key" E_WARNING).
 */
function createBindings(ctx: ResourceContext): string {
  const lines = ctx.fields.map((f) => {
    const cast = f.type === "boolean" ? "(int)" : "";
    const binding = f.required
      ? `${cast}$data['${f.name}']`
      : `isset($data['${f.name}']) && $data['${f.name}'] !== null ? ${cast}$data['${f.name}'] : null`;
    return `            '${f.name}' => ${binding},`;
  });
  return `${lines.join("\n")}\n            'created_at' => \\date('Y-m-d H:i:s'),`;
}

/** PHP field list (used by the dynamic UPDATE). */
function fieldListLiteral(ctx: ResourceContext): string {
  return ctx.fields.map((f) => `'${f.name}'`).join(", ");
}

export function renderRepositoryInterfaceTemplate(ctx: ResourceContext): string {
  const { className, tableName } = ctx;
  return `<?php

declare(strict_types=1);

namespace App\\Repositories;

use App\\Entities\\${className};

/**
 * Data access port of the ${className} resource (table ${tableName}).
 * The concrete implementation lives in ${className}Repository (adapter).
 */
interface ${className}RepositoryInterface
{
    public function findById(int $id): ?${className};

    /**
     * @return ${className}[]
     */
    public function findAll(): array;

    /**
     * @param array<string, mixed> $data
     */
    public function create(array $data): ${className};

    /**
     * @param array<string, mixed> $data
     */
    public function update(int $id, array $data): bool;

    public function delete(int $id): bool;
}
`;
}

export function renderRepositoryTemplate(ctx: ResourceContext): string {
  const { className, tableName } = ctx;
  const columns = columnList(ctx);
  const insertCols = insertColumns(ctx);
  const insertParams = insertPlaceholders(ctx);
  const fieldList = fieldListLiteral(ctx);

  return `<?php

declare(strict_types=1);

namespace App\\Repositories;

use App\\Entities\\${className};
use PDO;

/**
 * Data access adapter of the ${className} resource (table ${tableName}).
 * The only place with SQL for this resource. Uses prepared statements ALWAYS.
 */
final class ${className}Repository implements ${className}RepositoryInterface
{
    public function __construct(private readonly PDO $db)
    {
    }

    public function findById(int $id): ?${className}
    {
        $statement = $this->db->prepare(
            'SELECT ${columns} FROM ${tableName} WHERE id = :id LIMIT 1'
        );
        $statement->execute(['id' => $id]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);

        return $row === false ? null : ${className}::fromArray($row);
    }

    /**
     * @return ${className}[]
     */
    public function findAll(): array
    {
        $statement = $this->db->query(
            'SELECT ${columns} FROM ${tableName} ORDER BY id'
        );
        $rows = $statement->fetchAll(PDO::FETCH_ASSOC);

        return \\array_map(
            static fn (array $row): ${className} => ${className}::fromArray($row),
            $rows,
        );
    }

    /**
     * @param array<string, mixed> $data
     */
    public function create(array $data): ${className}
    {
        $statement = $this->db->prepare(
            'INSERT INTO ${tableName} (${insertCols}) VALUES (${insertParams})'
        );
        $statement->execute([
${createBindings(ctx)}
        ]);

        return $this->findById((int) $this->db->lastInsertId());
    }

    /**
     * UPDATE with a dynamic SET: only the keys present in $data are updated
     * (supports partial Service updates without nulling other fields).
     *
     * @param array<string, mixed> $data
     */
    public function update(int $id, array $data): bool
    {
        $sets = [];
        $values = [];

        foreach ([${fieldList}] as $field) {
            if (\\array_key_exists($field, $data)) {
                $sets[] = $field . ' = :' . $field;
                $values[$field] = $data[$field] ?? null;
            }
        }

        if ($sets === []) {
            return false;
        }

        $values['id'] = $id;
        $statement = $this->db->prepare(
            'UPDATE ${tableName} SET ' . \\implode(', ', $sets) . ' WHERE id = :id'
        );
        $statement->execute($values);

        return $statement->rowCount() > 0;
    }

    public function delete(int $id): bool
    {
        $statement = $this->db->prepare(
            'DELETE FROM ${tableName} WHERE id = :id'
        );
        $statement->execute(['id' => $id]);

        return $statement->rowCount() > 0;
    }
}
`;
}
