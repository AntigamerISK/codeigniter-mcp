/**
 * Tool 1 — `scaffold_full_resource` (spec section 2, already validated).
 *
 * Generates the full CRUD of a resource:
 * Controller + Service + Repository (interface & implementation) + Entity +
 * Migration + tests (unit & integration).
 *
 * Rules:
 * - `overwrite: true` is required to overwrite (destructive operation).
 * - Rate limited (heavy write tool).
 * - Deterministic output: same input + same state → same output.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  buildResourceContext,
  ci4MigrationTimestamp,
  FIELD_TYPE_TO_SAMPLE,
  migrationTimestamp,
  resolveInAppRoot,
  snakeToPascal,
  toRelativePath,
  type FieldDef,
  type ResourceContext,
  type ToolDeps,
} from "../core/config.js";
import { handleToolCall, type ToolResult } from "../core/errors.js";
import { safeWriteFile } from "../core/fs-safe.js";
import { ScaffoldFullResourceInput } from "../schemas/scaffold-full-resource.schema.js";
import {
  assertNoSqlInController,
  renderControllerTemplate,
  ALL_CONTROLLER_METHODS,
} from "../templates/controller.template.js";
import {
  renderCi4Controller,
  renderCi4Migration,
  renderCi4Model,
  renderCi4ModelTest,
  renderCi4Service,
  renderCi4View,
} from "../templates/ci4.template.js";
import { renderEntityTemplate } from "../templates/entity.template.js";
import { renderMigrationTemplate } from "../templates/migration.template.js";
import {
  renderRepositoryInterfaceTemplate,
  renderRepositoryTemplate,
} from "../templates/repository.template.js";
import { renderServiceTemplate } from "../templates/service.template.js";

export interface ScaffoldFullResourcePayload {
  filesCreated: string[];
  filesSkipped: string[];
  warnings: string[];
}

/* ------------------------------------------------------------------ */
/* Test templates (unit & integration)                                 */
/* ------------------------------------------------------------------ */

/** Sample PHP array used to build an entity in the tests. */
function entityFixtureArray(ctx: ResourceContext): string {
  const lines: string[] = ["'id' => 1,"];
  for (const field of ctx.fields) {
    const value = field.required
      ? FIELD_TYPE_TO_SAMPLE[field.type]
      : "null";
    lines.push(`'${field.name}' => ${value},`);
  }
  lines.push("'created_at' => '2026-01-01 00:00:00',");
  return lines.join("\n            ");
}

/** Sample PHP payload array for create()/store() calls in the tests. */
function payloadArray(fields: FieldDef[]): string {
  return fields
    .map((field) => `'${field.name}' => ${FIELD_TYPE_TO_SAMPLE[field.type]},`)
    .join("\n            ");
}

/** `self::assertSame` asserts over the required fields. */
function requiredAssertions(ctx: ResourceContext): string {
  const required = ctx.fields.filter((field) => field.required);
  if (required.length === 0) {
    return "        self::assertInstanceOf(Product::class, $result);".replace(
      "Product",
      ctx.className,
    );
  }
  return required
    .map(
      (field) =>
        `        self::assertSame(${FIELD_TYPE_TO_SAMPLE[field.type]}, $result->${field.name});`,
    )
    .join("\n");
}

function renderServiceTest(ctx: ResourceContext): string {
  const { className } = ctx;
  const hasRequired = ctx.fields.some((field) => field.required);

  const secondTest = hasRequired
    ? `
    public function testCreateRejectsMissingRequiredField(): void
    {
        $repository = $this->createMock(${className}RepositoryInterface::class);
        $repository->expects(self::never())->method('create');

        $service = new ${className}Service($repository);

        $this->expectException(\\InvalidArgumentException::class);
        $service->create([
            // ${ctx.fields.filter((f) => f.required)[0]!.name} intentionally omitted
            ${payloadArray(ctx.fields.filter((f) => f.name !== ctx.fields.find((x) => x.required)!.name))}
        ]);
    }
`
    : "";

  return `<?php

declare(strict_types=1);

namespace Tests\\Unit;

use App\\Entities\\${className};
use App\\Repositories\\${className}RepositoryInterface;
use App\\Services\\${className}Service;
use PHPUnit\\Framework\\TestCase;

final class ${className}ServiceTest extends TestCase
{
    public function testCreateReturnsCreated${className}(): void
    {
        $repository = $this->createMock(${className}RepositoryInterface::class);
        $entity = ${className}::fromArray([
            ${entityFixtureArray(ctx)}
        ]);
        $repository->method('create')->willReturn($entity);

        $service = new ${className}Service($repository);
        $result = $service->create([
            ${payloadArray(ctx.fields)}
        ]);

${requiredAssertions(ctx)}
    }
${secondTest}}
`;
}

function renderControllerTest(ctx: ResourceContext): string {
  const { className } = ctx;
  return `<?php

declare(strict_types=1);

namespace Tests\\Integration;

use App\\Controllers\\${className}Controller;
use App\\Entities\\${className};
use App\\Services\\${className}Service;
use PHPUnit\\Framework\\TestCase;

final class ${className}ControllerTest extends TestCase
{
    public function testStoreReturnsCreated${className}WithStatus201(): void
    {
        $service = $this->createMock(${className}Service::class);
        $entity = ${className}::fromArray([
            ${entityFixtureArray(ctx)}
        ]);
        $service->method('create')->willReturn($entity);

        $controller = new ${className}Controller($service);
        $response = $controller->store([
            ${payloadArray(ctx.fields)}
        ]);

        self::assertSame(201, $response['status']);
        self::assertSame(${FIELD_TYPE_TO_SAMPLE[ctx.fields[0]!.type]}, $response['data']->${ctx.fields[0]!.name});
    }

    public function testStoreReturns422WhenValidationFails(): void
    {
        $service = $this->createMock(${className}Service::class);
        $service->method('create')->willThrowException(
            new \\InvalidArgumentException('Validation failed')
        );

        $controller = new ${className}Controller($service);
        $response = $controller->store([]);

        self::assertSame(422, $response['status']);
    }
}
`;
}

/* ------------------------------------------------------------------ */
/* Tool                                                                 */
/* ------------------------------------------------------------------ */

export async function scaffoldFullResource(
  input: unknown,
  deps: ToolDeps,
): Promise<ToolResult<ScaffoldFullResourcePayload>> {
  return handleToolCall(async () => {
    const parsed = ScaffoldFullResourceInput.parse(input);
    const ctx = buildResourceContext(parsed.resourceName, parsed.fields);

    // Heavy write tool → consume a rate limiter token.
    deps.rateLimiter.consume();

    const warnings: string[] = [];
    const files: Array<{ rel: string; content: string }> = [];

    if (deps.conventions.framework === "ci4") {
      const ts = ci4MigrationTimestamp(deps.now());
      files.push(
        {
          rel: `app/Controllers/${ctx.className}.php`,
          content: renderCi4Controller(ctx),
        },
        {
          rel: `app/Models/${ctx.className}Model.php`,
          content: renderCi4Model(ctx),
        },
        {
          rel: `app/Database/Migrations/${ts}_Create${snakeToPascal(ctx.tableName)}.php`,
          content: renderCi4Migration(ctx, ts),
        },
        {
          rel: `app/Views/${ctx.kebabName}/index.php`,
          content: renderCi4View(ctx),
        },
      );
      if (parsed.withRepository) {
        // In ci4, withRepository means "include the Service" (business logic
        // layer that injects the Model). The Model is always generated.
        files.push({
          rel: `app/Services/${ctx.className}Service.php`,
          content: renderCi4Service(ctx),
        });
      } else {
        warnings.push(
          "withRepository=false: no Service was generated. Generate it with scaffold_service (with withRepository=true) if you need business logic separated from the controller.",
        );
      }
      if (parsed.withTests) {
        files.push({
          rel: `tests/unit/${ctx.className}ModelTest.php`,
          content: renderCi4ModelTest(ctx),
        });
      }
    } else {
      const timestamp = migrationTimestamp(deps.now());

      const controllerContent = renderControllerTemplate(
        ctx,
        [...ALL_CONTROLLER_METHODS],
      );
      assertNoSqlInController(controllerContent);

      const { content: serviceContent, warnings: serviceWarnings } =
        renderServiceTemplate(ctx);
      warnings.push(...serviceWarnings);

      files.push(
        {
          rel: `app/Controllers/${ctx.className}Controller.php`,
          content: controllerContent,
        },
        {
          rel: `app/Services/${ctx.className}Service.php`,
          content: serviceContent,
        },
      );

      if (parsed.withRepository) {
        files.push(
          {
            rel: `app/Repositories/${ctx.className}RepositoryInterface.php`,
            content: renderRepositoryInterfaceTemplate(ctx),
          },
          {
            rel: `app/Repositories/${ctx.className}Repository.php`,
            content: renderRepositoryTemplate(ctx),
          },
        );
      } else {
        warnings.push(
          "withRepository=false: no repositories were generated. The Service depends on the interface " +
            `(${ctx.className}RepositoryInterface, contract first); use scaffold_repository to generate it.`,
        );
      }

      files.push(
        {
          rel: `app/Entities/${ctx.className}.php`,
          content: renderEntityTemplate(ctx),
        },
        {
          rel: `app/Database/Migrations/${timestamp}_create_${ctx.tableName}_table.php`,
          content: renderMigrationTemplate(ctx, timestamp),
        },
      );

      if (parsed.withTests) {
        if (parsed.withRepository) {
          files.push({
            rel: `tests/Unit/${ctx.className}ServiceTest.php`,
            content: renderServiceTest(ctx),
          });
        } else {
          warnings.push(
            "withTests=true but withRepository=false: the Service unit test is skipped " +
              "(it depends on the repository interface, still missing).",
          );
        }
        files.push({
          rel: `tests/Integration/${ctx.className}ControllerTest.php`,
          content: renderControllerTest(ctx),
        });
      }
    }

    const filesCreated: string[] = [];
    const filesSkipped: string[] = [];

    for (const file of files) {
      const absPath = resolveInAppRoot(deps.appRoot, file.rel);
      const result = safeWriteFile(absPath, file.content, parsed.overwrite);
      const relative = toRelativePath(deps.appRoot, absPath);
      if (result.written) {
        filesCreated.push(relative);
      } else {
        filesSkipped.push(relative);
      }
    }

    return { filesCreated, filesSkipped, warnings };
  });
}

export function registerScaffoldFullResource(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    "scaffold_full_resource",
    {
      title: "Generate a complete CRUD resource",
      description:
        "Generates the full CRUD of a PHP resource: Controller, Service, Repository (interface + implementation), " +
        "Entity, Migration and tests (unit & integration). Requires overwrite=true to overwrite existing files.",
      inputSchema: ScaffoldFullResourceInput,
    },
    async (args) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await scaffoldFullResource(args, deps), null, 2),
        },
      ],
    }),
  );
}
