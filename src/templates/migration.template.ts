/**
 * PHP Migration template (spec: Tool 1 and framework structure).
 *
 * - Follows the framework's native migration system: the class extends
 *   `App\Core\Migration` and exposes `up(): string` / `down(): string` with SQL.
 * - The native runner (`php bin/migrate`) executes the SQL and records state.
 * - File name: `{YYYY_MM_DD}_create_{table}_table.php`.
 * - Class: `Create{Table}Table`.
 */

import type { ResourceContext } from "../core/config.js";
import { snakeToPascal } from "../core/config.js";

function columnLines(ctx: ResourceContext): string {
  const lines = ctx.fields.map((field) => {
    const nullability = field.required ? "NOT NULL" : "NULL";
    return `            ${field.name} ${field.columnType} ${nullability},`;
  });
  return lines.join("\n");
}

export function renderMigrationTemplate(
  ctx: ResourceContext,
  timestamp: string,
): string {
  // Class and file use the TABLE name (plural): CreateProductsTable /
  // 2026_08_12_create_products_table.php (spec, output example).
  const className = `Create${snakeToPascal(ctx.tableName)}Table`;
  return `<?php

declare(strict_types=1);

namespace App\\Database\\Migrations;

use App\\Core\\Migration;

/**
 * Migration: creates the ${ctx.tableName} table (${timestamp}).
 */
final class ${className} extends Migration
{
    public const TABLE = '${ctx.tableName}';

    public function up(): string
    {
        return <<<'SQL'
        CREATE TABLE ${ctx.tableName} (
            id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
${columnLines(ctx)}
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        SQL;
    }

    public function down(): string
    {
        return 'DROP TABLE IF EXISTS ${ctx.tableName}';
    }
}
`;
}
