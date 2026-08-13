import { describe, expect, it } from "vitest";
import {
  buildResourceContext,
  ci4MigrationTimestamp,
  createToolDeps,
  CI4_CONVENTIONS,
  detectFramework,
  loadProjectConventions,
  PROJECT_CONVENTIONS_FILE,
  SPEC_CONVENTIONS,
  type ProjectConventions,
} from "../../src/core/config.js";
import { ValidationError } from "../../src/core/errors.js";
import {
  renderCi4Controller,
  renderCi4Migration,
  renderCi4Model,
  renderCi4ModelTest,
  renderCi4View,
} from "../../src/templates/ci4.template.js";
import { analyzePhpFile } from "../../src/tools/lint-against-framework-rules.js";
import { scaffoldFullResource } from "../../src/tools/scaffold-full-resource.js";
import {
  createTestContext,
  makeTempAppRoot,
  mkdirInAppRoot,
  writeInAppRoot,
} from "../helpers.js";

const CTX = buildResourceContext("Patient", [
  { name: "fullName", type: "string", required: true, validation: "max:100" },
  { name: "age", type: "int", required: false },
]);

const CI4_CONV: ProjectConventions = CI4_CONVENTIONS;

describe("project conventions loader (.codeigniter-mcp.json)", () => {
  it("defaults to the spec profile when the file is missing", () => {
    const { root, cleanup } = makeTempAppRoot();
    try {
      expect(loadProjectConventions(root)).toEqual(SPEC_CONVENTIONS);
    } finally {
      cleanup();
    }
  });

  it("ci4 file enables the CI4 profile", () => {
    const { root, cleanup } = makeTempAppRoot();
    try {
      writeInAppRoot(
        root,
        PROJECT_CONVENTIONS_FILE,
        JSON.stringify({ framework: "ci4" }),
      );
      const conv = loadProjectConventions(root);
      expect(conv.framework).toBe("ci4");
      expect(conv.methodCase).toBe("snake_case");
      expect(conv.requireStrictTypes).toBe(false);
      expect(conv.controllerSuffix).toBe("");
      expect(conv.migration.up).toEqual(["php", "spark", "migrate"]);
      expect(conv.migration.down).toEqual(["php", "spark", "migrate:rollback"]);
    } finally {
      cleanup();
    }
  });

  it("overrides methodCase", () => {
    const { root, cleanup } = makeTempAppRoot();
    try {
      writeInAppRoot(
        root,
        PROJECT_CONVENTIONS_FILE,
        JSON.stringify({ framework: "ci4", methodCase: "camelCase" }),
      );
      expect(loadProjectConventions(root).methodCase).toBe("camelCase");
    } finally {
      cleanup();
    }
  });

  it("invalid JSON → ValidationError", () => {
    const { root, cleanup } = makeTempAppRoot();
    try {
      writeInAppRoot(root, PROJECT_CONVENTIONS_FILE, "not json");
      expect(() => loadProjectConventions(root)).toThrow(ValidationError);
    } finally {
      cleanup();
    }
  });

  it("unknown framework → ValidationError", () => {
    const { root, cleanup } = makeTempAppRoot();
    try {
      writeInAppRoot(
        root,
        PROJECT_CONVENTIONS_FILE,
        JSON.stringify({ framework: "ci5" }),
      );
      expect(() => loadProjectConventions(root)).toThrow(ValidationError);
    } finally {
      cleanup();
    }
  });
});

describe("framework auto-detection (no .codeigniter-mcp.json)", () => {
  it("detects ci4 from app/Config/Paths.php", () => {
    const { root, cleanup } = makeTempAppRoot();
    try {
      writeInAppRoot(root, "app/Config/Paths.php", "<?php\n");
      expect(detectFramework(root)).toBe("ci4");
      expect(loadProjectConventions(root).framework).toBe("ci4");
      expect(loadProjectConventions(root).migration.up).toEqual([
        "php",
        "spark",
        "migrate",
      ]);
    } finally {
      cleanup();
    }
  });

  it("detects ci4 from the spark runner", () => {
    const { root, cleanup } = makeTempAppRoot();
    try {
      writeInAppRoot(root, "spark", "#!/usr/bin/env php\n");
      expect(detectFramework(root)).toBe("ci4");
    } finally {
      cleanup();
    }
  });

  it("detects spec from bin/migrate", () => {
    const { root, cleanup } = makeTempAppRoot();
    try {
      writeInAppRoot(root, "bin/migrate", "#!/usr/bin/env php\n");
      expect(detectFramework(root)).toBe("spec");
    } finally {
      cleanup();
    }
  });

  it("detects spec from app/Repositories (repository layer present)", () => {
    const { root, cleanup } = makeTempAppRoot();
    try {
      mkdirInAppRoot(root, "app/Repositories");
      expect(detectFramework(root)).toBe("spec");
    } finally {
      cleanup();
    }
  });

  it("ci4 markers take precedence when both sets are present", () => {
    const { root, cleanup } = makeTempAppRoot();
    try {
      writeInAppRoot(root, "app/Config/Paths.php", "<?php\n");
      writeInAppRoot(root, "bin/migrate", "#!/usr/bin/env php\n");
      expect(detectFramework(root)).toBe("ci4");
    } finally {
      cleanup();
    }
  });

  it("an explicit .codeigniter-mcp.json always wins over auto-detection", () => {
    const { root, cleanup } = makeTempAppRoot();
    try {
      writeInAppRoot(root, "app/Config/Paths.php", "<?php\n");
      writeInAppRoot(
        root,
        PROJECT_CONVENTIONS_FILE,
        JSON.stringify({ framework: "spec" }),
      );
      expect(loadProjectConventions(root).framework).toBe("spec");
    } finally {
      cleanup();
    }
  });
});

describe("ci4 templates", () => {
  it("controller: extends BaseController, delegates to the Model", () => {
    const content = renderCi4Controller(CTX);
    expect(content).toContain("namespace App\\Controllers;");
    expect(content).toContain("use App\\Controllers\\BaseController;");
    expect(content).toContain("use App\\Models\\PatientModel;");
    expect(content).toContain("class Patient extends BaseController");
    expect(content).toContain("$this->model->findAll()");
    expect(content).toContain("'fullName' => 'required|max_length[100]'");
    expect(content).toContain("redirect()->to('/patient')");
    expect(content).toContain("throw \\CodeIgniter\\Exceptions\\PageNotFoundException");
  });

  it("model: extends Model with table and allowedFields", () => {
    const content = renderCi4Model(CTX);
    expect(content).toContain("namespace App\\Models;");
    expect(content).toContain("class PatientModel extends Model");
    expect(content).toContain("protected $table            = 'patients';");
    expect(content).toContain("protected $allowedFields    = ['fullName', 'age'];");
    expect(content).toContain("protected $useTimestamps = true;");
  });

  it("migration: forge + createTable + class name", () => {
    const content = renderCi4Migration(CTX, "2026-08-12-103000");
    expect(content).toContain("class CreatePatients extends Migration");
    expect(content).toContain("$this->forge->addField(");
    expect(content).toContain("$this->forge->createTable('patients', true);");
    expect(content).toContain("$this->forge->dropTable('patients', true);");
    expect(content).toContain("'fullName' => [");
  });

  it("view: renders the listing with esc()", () => {
    const content = renderCi4View(CTX);
    expect(content).toContain("<h1>Patient list</h1>");
    expect(content).toContain("<?= esc($item['fullName']) ?>");
  });

  it("model test references the table", () => {
    const content = renderCi4ModelTest(CTX);
    expect(content).toContain("class PatientModelTest extends CIUnitTestCase");
    expect(content).toContain("'patients', $model->table");
  });

  it("ci4MigrationTimestamp format", () => {
    expect(ci4MigrationTimestamp(new Date("2026-08-12T10:30:05.000Z"))).toBe(
      "2026-08-12-103005",
    );
  });
});

describe("ci4 lint profile", () => {
  const CI4_CONTROLLER = `<?php

namespace App\\Controllers;

use App\\Controllers\\BaseController;
use App\\Models\\PatientModel;

class Patient extends BaseController
{
    protected $model;

    public function index()
    {
        $data['items'] = $this->model->findAll();
        return view('patient/index', $data);
    }
}
`;

  it("CI4 controller (snake_case, no strict types, no suffix) is compliant", () => {
    const violations = analyzePhpFile(
      CI4_CONTROLLER,
      "app/Controllers/Patient.php",
      "C:/app",
      CI4_CONV,
    );
    expect(violations).toEqual([]);
  });

  it("same file under the spec profile reports strict-types and naming errors", () => {
    const violations = analyzePhpFile(
      CI4_CONTROLLER,
      "app/Controllers/Patient.php",
      "C:/app",
    );
    expect(violations).toContainEqual(
      expect.objectContaining({ rule: "missing-strict-types", severity: "error" }),
    );
    expect(violations).toContainEqual(
      expect.objectContaining({
        rule: "naming-convention",
        severity: "error",
      }),
    );
  });

  it("SQL in a CI4 controller is a warning, not an error", () => {
    const content = CI4_CONTROLLER.replace(
      "$this->model->findAll()",
      "$this->db->query('SELECT * FROM patients')->getResultArray()",
    );
    const violations = analyzePhpFile(
      content,
      "app/Controllers/Patient.php",
      "C:/app",
      CI4_CONV,
    );
    const noQuery = violations.find((v) => v.rule === "no-query-in-controller");
    expect(noQuery).toBeDefined();
    expect(noQuery?.severity).toBe("warning");
    expect(violations.some((v) => v.severity === "error")).toBe(false);
  });
});

describe("scaffold_full_resource with the ci4 profile", () => {
  it("creates Controller, Model, Migration and View (+ test) and warns about repositories", async () => {
    const { deps, cleanup } = createTestContext({ conventions: CI4_CONV });
    try {
      const result = await scaffoldFullResource(
        {
          resourceName: "Patient",
          fields: [
            { name: "fullName", type: "string", required: true },
            { name: "age", type: "int", required: false },
          ],
          withTests: true,
          withRepository: true,
        },
        deps,
      );
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.filesCreated).toContain("app/Controllers/Patient.php");
      expect(result.filesCreated).toContain("app/Models/PatientModel.php");
      expect(result.filesCreated).toContain("app/Views/patient/index.php");
      expect(
        result.filesCreated.some((f) =>
          f.includes("Database/Migrations") && f.includes("_CreatePatients"),
        ),
      ).toBe(true);
      expect(
        result.filesCreated.some((f) => f.includes("PatientModelTest.php")),
      ).toBe(true);
      expect(
        result.warnings.some((w) => w.includes("withRepository=true is ignored")),
      ).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("detects ci4 from the .codeigniter-mcp.json file at APP_ROOT", async () => {
    const { root, cleanup } = makeTempAppRoot();
    try {
      writeInAppRoot(
        root,
        PROJECT_CONVENTIONS_FILE,
        JSON.stringify({ framework: "ci4" }),
      );
      const deps = createToolDeps({ appRoot: root });
      const result = await scaffoldFullResource(
        {
          resourceName: "Order",
          fields: [{ name: "total", type: "float", required: true }],
          withTests: false,
          withRepository: false,
        },
        deps,
      );
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.filesCreated).toContain("app/Controllers/Order.php");
      expect(result.filesCreated).toContain("app/Models/OrderModel.php");
    } finally {
      cleanup();
    }
  });
});
