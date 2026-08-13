/**
 * PHP Service template (spec: Tool 2b).
 *
 * - Contains the business logic and receives the Repository through
 *   dependency injection via the interface (`{Resource}RepositoryInterface`).
 * - Only layer authorized to validate input (sanitization by default).
 * - If `withRepository === false`, the interface does not exist yet: the
 *   Service is still generated injecting the contract (contract first).
 */

import type { FieldDef, ResourceContext } from "../core/config.js";

export interface ParsedValidationRules {
  /** PHP rule entries, e.g. `'required' => true`, `'max' => 255`. */
  entries: string[];
  /** Unsupported validation tokens (reported as warnings). */
  warnings: string[];
}

/**
 * Translates the validation string (e.g. "max:255|email") into PHP entries.
 * Supported tokens: `max:N`, `min:N`, `email`, `required`.
 */
export function parseValidationRules(validation: string | undefined): ParsedValidationRules {
  const entries: string[] = [];
  const warnings: string[] = [];

  if (!validation) {
    return { entries, warnings };
  }

  for (const rawToken of validation.split("|")) {
    const token = rawToken.trim();
    if (token.length === 0) {
      continue;
    }
    const maxMatch = /^max:(\d+)$/.exec(token);
    if (maxMatch) {
      entries.push(`'max' => ${maxMatch[1]}`);
      continue;
    }
    const minMatch = /^min:(\d+)$/.exec(token);
    if (minMatch) {
      entries.push(`'min' => ${minMatch[1]}`);
      continue;
    }
    if (token === "email") {
      entries.push("'email' => true");
      continue;
    }
    if (token === "required") {
      continue; // covered by the field's required flag
    }
    warnings.push(`Unsupported validation rule: '${token}'`);
  }

  return { entries, warnings };
}

function renderRules(fields: FieldDef[]): string {
  const lines = fields.map((field) => {
    const { entries } = parseValidationRules(field.validation);
    const all = [...(field.required ? ["'required' => true"] : []), ...entries];
    return `        '${field.name}' => [${all.join(", ")}],`;
  });
  return lines.join("\n");
}

/**
 * Renders the full Service.
 * Also returns the validation warnings so the tool can report them.
 */
export function renderServiceTemplate(
  ctx: ResourceContext,
): { content: string; warnings: string[] } {
  const { className, tableName } = ctx;
  const warnings: string[] = [];

  for (const field of ctx.fields) {
    const { warnings: fieldWarnings } = parseValidationRules(field.validation);
    warnings.push(...fieldWarnings);
  }

  const content = `<?php

declare(strict_types=1);

namespace App\\Services;

use App\\Entities\\${className};
use App\\Repositories\\${className}RepositoryInterface;

/**
 * Business logic of the ${className} resource (table ${tableName}).
 *
 * - Receives the Repository through dependency injection via the interface.
 * - Only layer authorized to validate input and orchestrate data.
 * - ZERO knowledge of the HTTP transport (no requests/responses awareness).
 */
class ${className}Service
{
    /**
     * Validation rules per field.
     *
     * @var array<string, array{required?: bool, max?: int, min?: int, email?: bool}>
     */
    private const RULES = [
${renderRules(ctx.fields)}
    ];

    public function __construct(private readonly ${className}RepositoryInterface $repository)
    {
    }

    /**
     * @return ${className}[]
     */
    public function getAll(): array
    {
        return $this->repository->findAll();
    }

    public function getById(int $id): ?${className}
    {
        return $this->repository->findById($id);
    }

    /**
     * @param array<string, mixed> $data
     */
    public function create(array $data): ${className}
    {
        $this->validate($data);

        return $this->repository->create($data);
    }

    /**
     * @param array<string, mixed> $data
     */
    public function update(int $id, array $data): bool
    {
        $this->validate($data, partial: true);

        return $this->repository->update($id, $data);
    }

    public function delete(int $id): bool
    {
        return $this->repository->delete($id);
    }

    /**
     * Validates $data against the declared rules.
     * In partial mode (update) only the present fields are validated.
     *
     * @param array<string, mixed> $data
     *
     * @throws \\InvalidArgumentException when validation fails
     */
    private function validate(array $data, bool $partial = false): void
    {
        $errors = [];

        foreach (self::RULES as $field => $rules) {
            if ($partial && !\\array_key_exists($field, $data)) {
                continue;
            }

            $value = $data[$field] ?? null;

            if (($rules['required'] ?? false) && ($value === null || $value === '')) {
                $errors[$field][] = 'required';
                continue;
            }

            if ($value === null) {
                continue;
            }

            if (isset($rules['max']) && \\mb_strlen((string) $value) > $rules['max']) {
                $errors[$field][] = 'max_length[' . $rules['max'] . ']';
            }

            if (isset($rules['min']) && \\mb_strlen((string) $value) < $rules['min']) {
                $errors[$field][] = 'min_length[' . $rules['min'] . ']';
            }

            if (($rules['email'] ?? false) && !\\filter_var($value, \\FILTER_VALIDATE_EMAIL)) {
                $errors[$field][] = 'valid_email';
            }
        }

        if ($errors !== []) {
            throw new \\InvalidArgumentException('Validation failed: ' . \\json_encode($errors));
        }
    }
}
`;

  return { content, warnings };
}
