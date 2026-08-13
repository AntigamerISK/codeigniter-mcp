import { describe, expect, it } from "vitest";
import {
  analyzePhpFile,
  lintAgainstFrameworkRules,
} from "../../src/tools/lint-against-framework-rules.js";
import {
  createTestContext,
  writeInAppRoot,
} from "../helpers.js";

const STRICT_HEADER = `<?php

declare(strict_types=1);

namespace App\\Controllers;

use App\\Services\\ProductService;

final class ProductController
{
    public function __construct(private readonly ProductService $service)
    {
    }

    public function index(): array
    {
        return $this->service->getAll();
    }
}
`;

describe("analyzePhpFile", () => {
  it("controller limpio es compliant (sin violaciones de error)", () => {
    const violations = analyzePhpFile(
      STRICT_HEADER,
      "app/Controllers/ProductController.php",
      "C:/proyecto",
    );
    expect(violations.filter((v) => v.severity === "error")).toEqual([]);
  });

  it("missing-strict-types: error si falta declare", () => {
    const content = "<?php\n\nnamespace App\\Controllers;\n\nclass ProductController {}\n";
    const violations = analyzePhpFile(
      content,
      "app/Controllers/ProductController.php",
      "C:/proyecto",
    );
    expect(violations).toContainEqual(
      expect.objectContaining({ rule: "missing-strict-types", severity: "error" }),
    );
  });

  it("no-query-in-controller: error with SQL or DB access", () => {
    const content = STRICT_HEADER + "\n\n    public function hack(): array\n    {\n        return $this->db->query('SELECT * FROM products');\n    }\n";
    const violations = analyzePhpFile(
      content,
      "app/Controllers/ProductController.php",
      "C:/proyecto",
    );
    expect(violations).toContainEqual(
      expect.objectContaining({ rule: "no-query-in-controller", severity: "error" }),
    );
  });

  it("no-query-in-controller: no marca docblocks ni strings", () => {
    const content = `<?php

declare(strict_types=1);

namespace App\\Controllers;

use App\\Services\\ProductService;

final class ProductController
{
    public function __construct(private readonly ProductService $service)
    {
    }

    /**
     * DELETE /products/{id}
     * Endpoint documentation.
     */
    public function show(int $id): array
    {
        // Note: SELECT is not used here, everything goes through the Service.
        $label = 'DELETE /products/{id} (doc)';

        return $this->service->getById($id) === null ? ['status' => 404] : ['status' => 200];
    }
}
`;
    const violations = analyzePhpFile(
      content,
      "app/Controllers/ProductController.php",
      "C:/proyecto",
    );
    expect(
      violations.filter((v) => v.rule === "no-query-in-controller"),
    ).toEqual([]);
  });

  it("no-query-in-controller: heredoc con texto tipo-SQL no es falso positivo", () => {
    const content = `<?php

declare(strict_types=1);

namespace App\\Controllers;

final class ProductController
{
    public function email(): string
    {
        $template = <<<TXT
FROM: sistema@example.com
SELECT esto es solo un template de correo
TXT;

        return $template;
    }
}
`;
    const violations = analyzePhpFile(
      content,
      "app/Controllers/ProductController.php",
      "C:/proyecto",
    );
    expect(
      violations.filter((v) => v.rule === "no-query-in-controller"),
    ).toEqual([]);
  });

  it("no-query-in-controller: heredoc with SQL + ->query() IS flagged (via DB access)", () => {
    const content = `<?php

declare(strict_types=1);

namespace App\\Controllers;

final class ProductController
{
    public function bad(): array
    {
        $sql = <<<SQL
SELECT * FROM products
SQL;

        return $this->db->query($sql)->fetchAll();
    }
}
`;
    const violations = analyzePhpFile(
      content,
      "app/Controllers/ProductController.php",
      "C:/proyecto",
    );
    const noQuery = violations.filter((v) => v.rule === "no-query-in-controller");
    expect(noQuery).toHaveLength(1);
  });

  it("missing-input-validation: error with $_POST without validation", () => {
    const content = `<?php

declare(strict_types=1);

namespace App\\Controllers;

final class RawController
{
    public function store(): array
    {
        $name = $_POST['name'];
        return ['name' => $name];
    }
}
`;
    const violations = analyzePhpFile(
      content,
      "app/Controllers/RawController.php",
      "C:/proyecto",
    );
    expect(violations).toContainEqual(
      expect.objectContaining({ rule: "missing-input-validation", severity: "error" }),
    );
  });

  it("naming-convention: error si clase/archivo no coinciden", () => {
    const content = `<?php

declare(strict_types=1);

namespace App\\Services;

final class ProductManager
{
}
`;
    const violations = analyzePhpFile(
      content,
      "app/Services/ProductService.php",
      "C:/proyecto",
    );
    expect(violations).toContainEqual(
      expect.objectContaining({ rule: "naming-convention", severity: "error" }),
    );
  });

  it("naming-convention: method starting with an uppercase letter is an error", () => {
    const content = `<?php

declare(strict_types=1);

namespace App\\Services;

final class ProductService
{
    public function GetById(int $id): int
    {
        return $id;
    }
}
`;
    const violations = analyzePhpFile(
      content,
      "app/Services/ProductService.php",
      "C:/proyecto",
    );
    expect(violations).toContainEqual(
      expect.objectContaining({
        rule: "naming-convention",
        severity: "error",
        message: expect.stringContaining("GetById"),
      }),
    );
  });

  it("repository-without-interface: error when the interface is missing", () => {
    const content = `<?php

declare(strict_types=1);

namespace App\\Repositories;

final class ProductRepository
{
}
`;
    const violations = analyzePhpFile(
      content,
      "app/Repositories/ProductRepository.php",
      "C:/proyecto",
    );
    expect(violations).toContainEqual(
      expect.objectContaining({ rule: "repository-without-interface", severity: "error" }),
    );
  });

  it("repository con su interfaz presente es compliant", async () => {
    const { root, deps, cleanup } = createTestContext();
    try {
      writeInAppRoot(
        root,
        "app/Repositories/ProductRepositoryInterface.php",
        `<?php

declare(strict_types=1);

namespace App\\Repositories;

interface ProductRepositoryInterface
{
}
`,
      );
      const impl = `<?php

declare(strict_types=1);

namespace App\\Repositories;

final class ProductRepository
{
}
`;
      const violations = analyzePhpFile(
        impl,
        "app/Repositories/ProductRepository.php",
        root,
      );
      expect(
        violations.filter((v) => v.rule === "repository-without-interface"),
      ).toEqual([]);
    } finally {
      cleanup();
    }
  });
});

describe("lint_against_framework_rules (tool)", () => {
  it("lint of code generated by scaffold_full_resource: ALL compliant", async () => {
    const { root, deps, cleanup } = createTestContext();
    try {
      const { scaffoldFullResource } = await import(
        "../../src/tools/scaffold-full-resource.js"
      );
      const scaffold = await scaffoldFullResource(
        {
          resourceName: "Product",
          fields: [
            { name: "title", type: "string", required: true, validation: "max:255" },
            { name: "price", type: "float", required: true },
          ],
        },
        deps,
      );
      expect(scaffold.success).toBe(true);
      if (!scaffold.success) return;

      for (const rel of scaffold.filesCreated) {
        const result = await lintAgainstFrameworkRules({ filePath: rel }, deps);
        expect(result.success, rel).toBe(true);
        if (result.success) {
          const errors = result.violations.filter((v) => v.severity === "error");
          expect(errors, `${rel}: ${JSON.stringify(errors)}`).toEqual([]);
        }
      }
    } finally {
      cleanup();
    }
  });

  it("archivo inexistente → ValidationError", async () => {
    const { deps, cleanup } = createTestContext();
    try {
      const result = await lintAgainstFrameworkRules(
        { filePath: "app/Controllers/NoExiste.php" },
        deps,
      );
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.type).toBe("ValidationError");
    } finally {
      cleanup();
    }
  });

  it("path traversal outside APP_ROOT → ValidationError", async () => {
    const { deps, cleanup } = createTestContext();
    try {
      const result = await lintAgainstFrameworkRules(
        { filePath: "../../../../Windows/win.ini" },
        deps,
      );
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error.type).toBe("ValidationError");
    } finally {
      cleanup();
    }
  });

  it("warnings do not block (compliant=true with only warnings)", async () => {
    const { root, deps, cleanup } = createTestContext();
    try {
      writeInAppRoot(
        root,
        "app/Services/ProductService.php",
        `<?php

declare(strict_types=1);

namespace App\\Services;
`,
      );
      const result = await lintAgainstFrameworkRules(
        { filePath: "app/Services/ProductService.php" },
        deps,
      );
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.violations.some((v) => v.severity === "warning")).toBe(true);
      expect(result.compliant).toBe(true);
    } finally {
      cleanup();
    }
  });
});
