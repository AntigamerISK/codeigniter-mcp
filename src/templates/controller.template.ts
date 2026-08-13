/**
 * PHP Controller template (spec: Tool 2a).
 *
 * Hard framework rule:
 * - The controller ONLY contains calls to `{Resource}Service`.
 * - ZERO queries, ZERO inline validation (everything lives in the Service).
 */

import type { ResourceContext } from "../core/config.js";
import { ConventionViolationError } from "../core/errors.js";

export type ControllerMethodName = "index" | "show" | "store" | "update" | "destroy";

/**
 * Strong SQL keyword pattern (avoids false positives in docblocks
 * like "DELETE /products/{id}"): requires real SQL constructs.
 */
const SQL_CONSTRUCT_PATTERN =
  /\bSELECT\b|\bINSERT\s+INTO\b|\bUPDATE\s+\w+\s+SET\b|\bDELETE\s+FROM\b|\bJOIN\b/i;

/**
 * Build-time static check (spec Tool 2a): the generated controller must NEVER
 * contain queries or direct data access. If the template produced SQL, the
 * tool fails with `ConventionViolationError` before writing the file.
 */
export function assertNoSqlInController(content: string): void {
  if (SQL_CONSTRUCT_PATTERN.test(content)) {
    throw new ConventionViolationError(
      "The generated controller contains SQL. Controllers must NOT access data: delegate to the Service.",
    );
  }
}

export const ALL_CONTROLLER_METHODS: ControllerMethodName[] = [
  "index",
  "show",
  "store",
  "update",
  "destroy",
];

function renderIndex(kebab: string, entity: string): string {
  return `    /**
     * GET /${kebab}
     * Lists all resources.
     *
     * @return array{data: ${entity}[], status: int}
     */
    public function index(): array
    {
        return [
            'data' => $this->service->getAll(),
            'status' => 200,
        ];
    }

`;
}

function renderShow(kebab: string, entity: string): string {
  return `    /**
     * GET /${kebab}/{id}
     * Gets a resource by id.
     *
     * @return array{data?: ${entity}, error?: string, status: int}
     */
    public function show(int $id): array
    {
        $record = $this->service->getById($id);

        return $record === null
            ? ['error' => 'not_found', 'status' => 404]
            : ['data' => $record, 'status' => 200];
    }

`;
}

function renderStore(kebab: string, entity: string): string {
  return `    /**
     * POST /${kebab}
     * Creates a resource.
     *
     * @param array<string, mixed> $data
     *
     * @return array{data?: ${entity}, error?: string, status: int}
     */
    public function store(array $data): array
    {
        try {
            $record = $this->service->create($data);

            return ['data' => $record, 'status' => 201];
        } catch (\\InvalidArgumentException $exception) {
            return ['error' => 'validation_failed', 'status' => 422];
        }
    }

`;
}

function renderUpdate(kebab: string, entity: string): string {
  return `    /**
     * PUT /${kebab}/{id}
     * Updates a resource.
     *
     * @param array<string, mixed> $data
     *
     * @return array{data?: ${entity}, error?: string, status: int}
     */
    public function update(int $id, array $data): array
    {
        try {
            $updated = $this->service->update($id, $data);

            return $updated
                ? ['data' => $this->service->getById($id), 'status' => 200]
                : ['error' => 'not_found', 'status' => 404];
        } catch (\\InvalidArgumentException $exception) {
            return ['error' => 'validation_failed', 'status' => 422];
        }
    }

`;
}

function renderDestroy(kebab: string): string {
  return `    /**
     * DELETE /${kebab}/{id}
     * Deletes a resource.
     *
     * @return array{error?: string, status: int}
     */
    public function destroy(int $id): array
    {
        return $this->service->delete($id)
            ? ['status' => 204]
            : ['error' => 'not_found', 'status' => 404];
    }
`;
}

const METHOD_RENDERERS: Record<
  ControllerMethodName,
  (kebab: string, entity: string) => string
> = {
  index: renderIndex,
  show: renderShow,
  store: renderStore,
  update: renderUpdate,
  destroy: renderDestroy,
};

/**
 * Renders the full controller.
 *
 * @param methods Methods to include; an empty array generates a controller
 *                without REST methods — explicitly allowed.
 */
export function renderControllerTemplate(
  ctx: ResourceContext,
  methods: ControllerMethodName[],
): string {
  const { className, kebabName } = ctx;
  const body = methods
    .map((method) => METHOD_RENDERERS[method](kebabName, className))
    .join("\n");

  return `<?php

declare(strict_types=1);

namespace App\\Controllers;

use App\\Entities\\${className};
use App\\Services\\${className}Service;

/**
 * ${className} controller.
 *
 * Framework rules (see convention://architecture):
 * - ZERO business logic and ZERO queries: everything is delegated to ${className}Service.
 * - ZERO inline validation: all validation lives in the Service.
 * - The Service is received through dependency injection.
 */
final class ${className}Controller
{
    public function __construct(private readonly ${className}Service $service)
    {
    }

${body.trimEnd()}
}
`;
}
