/**
 * PHP Entity template (spec: generated framework structure).
 *
 * - Immutable, typed object that travels between layers.
 * - Never loose arrays outside of the adapters.
 */

import type { ResourceContext } from "../core/config.js";

function constructorParams(ctx: ResourceContext): string {
  const lines: string[] = ["public readonly ?int $id"];
  for (const field of ctx.fields) {
    lines.push(
      field.required
        ? `public readonly ${field.phpType} $${field.name}`
        : `public readonly ?${field.phpType} $${field.name} = null`,
    );
  }
  lines.push("public readonly \\DateTimeImmutable $createdAt");
  return lines.join(",\n        ");
}

function fromArrayAssignments(ctx: ResourceContext): string {
  const lines: string[] = ["id: isset($data['id']) ? (int) $data['id'] : null,"];
  for (const field of ctx.fields) {
    if (field.required) {
      lines.push(
        `${field.name}: (${field.phpType}) $data['${field.name}'],`,
      );
    } else {
      lines.push(
        `${field.name}: isset($data['${field.name}']) && $data['${field.name}'] !== null`
          + ` ? (${field.phpType}) $data['${field.name}'] : null,`,
      );
    }
  }
  lines.push(
    "createdAt: isset($data['created_at'])",
    "    ? new \\DateTimeImmutable((string) $data['created_at'])",
    "    : new \\DateTimeImmutable(),",
  );
  return lines.join("\n            ");
}

function toArrayEntries(ctx: ResourceContext): string {
  const lines: string[] = ["'id' => $this->id,"];
  for (const field of ctx.fields) {
    lines.push(`'${field.name}' => $this->${field.name},`);
  }
  lines.push("'created_at' => $this->createdAt->format('Y-m-d H:i:s'),");
  return lines.join("\n            ");
}

export function renderEntityTemplate(ctx: ResourceContext): string {
  const { className, tableName } = ctx;
  return `<?php

declare(strict_types=1);

namespace App\\Entities;

/**
 * ${className} entity (table ${tableName}).
 *
 * Immutable, typed object that travels between layers.
 * It is the only in-memory representation of the resource.
 */
final class ${className}
{
    public function __construct(
        ${constructorParams(ctx)}
    ) {
    }

    /**
     * Creates the entity from a data array (DB row or payload).
     *
     * @param array<string, mixed> $data
     */
    public static function fromArray(array $data): self
    {
        return new self(
            ${fromArrayAssignments(ctx)}
        );
    }

    /**
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            ${toArrayEntries(ctx)}
        ];
    }
}
`;
}
