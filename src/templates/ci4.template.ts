/**
 * CodeIgniter 4 native templates (ci4 profile).
 *
 * - Controller extends `BaseController`, delegates data to the Model.
 * - Model extends `CodeIgniter\Model` (Query Builder, no PDO boilerplate).
 * - Migration uses `$this->forge` (CI4 native) and runs via `php spark migrate`.
 * - View: minimal `app/Views/{kebab}/index.php` listing.
 */

import { snakeToPascal, type ResourceContext } from "../core/config.js";

function columnDef(ctx: ResourceContext, field: ResourceContext["fields"][number]): string {
  const type: Record<string, string> = {
    string: "'type' => 'VARCHAR', 'constraint' => 255",
    int: "'type' => 'INT', 'constraint' => 11",
    float: "'type' => 'FLOAT'",
    boolean: "'type' => 'BOOLEAN'",
    date: "'type' => 'DATE'",
    text: "'type' => 'TEXT'",
  };
  const nullLine = field.required ? "" : ",\n                'null' => true";
  return `            '${field.name}' => [\n                ${type[field.type]}${nullLine},\n            ],`;
}

/** CI4 validation rule for a field (required + type + custom validation). */
function ci4Rule(field: ResourceContext["fields"][number]): string {
  const rules: string[] = [];
  if (field.required) rules.push("required");
  let maxLength: string | null = null;
  if (field.validation) {
    for (const raw of field.validation.split("|")) {
      const rule = raw.trim();
      const max = /^max:(\d+)$/.exec(rule);
      if (max) {
        maxLength = max[1] ?? null;
      } else if (rule === "email") {
        rules.push("valid_email");
      }
    }
  }
  switch (field.type) {
    case "int":
      rules.push("integer");
      break;
    case "float":
      rules.push("decimal");
      break;
    case "boolean":
      rules.push("in_list[0,1]");
      break;
    case "date":
      rules.push("valid_date");
      break;
    case "string":
      rules.push(maxLength ? `max_length[${maxLength}]` : "max_length[255]");
      break;
    default:
      break;
  }
  return rules.join("|");
}

export function renderCi4Controller(ctx: ResourceContext): string {
  const { className, kebabName } = ctx;
  const rules = ctx.fields
    .map((field) => `            '${field.name}' => '${ci4Rule(field)}',`)
    .join("\n");
  const columns = ctx.fields
    .map((field) => `<th>${field.name}</th>`)
    .join("\n              ");
  return `<?php

namespace App\\Controllers;

use App\\Controllers\\BaseController;
use App\\Models\\${className}Model;

class ${className} extends BaseController
{
    protected $model;

    public function __construct()
    {
        $this->model = new ${className}Model();
    }

    public function index()
    {
        $data['items'] = $this->model->findAll();

        return view('${kebabName}/index', $data);
    }

    public function create()
    {
        return view('${kebabName}/create');
    }

    public function store()
    {
        $rules = [
${rules}
        ];

        if (! $this->validate($rules)) {
            return redirect()->back()->withInput()
                ->with('errors', $this->validator->getErrors());
        }

        $this->model->save($this->request->getPost());

        return redirect()->to('/${kebabName}')->with('success', 'Created.');
    }

    public function edit($id = null)
    {
        $data['item'] = $this->model->find($id);

        if ($data['item'] === null) {
            throw \\CodeIgniter\\Exceptions\\PageNotFoundException::forPageNotFound();
        }

        return view('${kebabName}/edit', $data);
    }

    public function update($id = null)
    {
        $rules = [
${rules}
        ];

        if (! $this->validate($rules)) {
            return redirect()->back()->withInput()
                ->with('errors', $this->validator->getErrors());
        }

        $this->model->update($id, $this->request->getPost());

        return redirect()->to('/${kebabName}')->with('success', 'Updated.');
    }

    public function delete($id = null)
    {
        $this->model->delete($id);

        return redirect()->to('/${kebabName}');
    }
}
`;
}

/**
 * CI4 Service: business logic separated from the controller, with the Model
 * injected. Mirrors the spec profile's Service role in native CI4 style
 * (no strict_types, snake_case methods).
 */
export function renderCi4Service(ctx: ResourceContext): string {
  const { className } = ctx;
  return `<?php

namespace App\\Services;

use App\\Models\\${className}Model;

class ${className}Service
{
    protected $model;

    public function __construct()
    {
        $this->model = new ${className}Model();
    }

    public function all()
    {
        return $this->model->findAll();
    }

    public function find($id)
    {
        return $this->model->find($id);
    }

    public function create(array $data)
    {
        return $this->model->insert($data);
    }

    public function update($id, array $data)
    {
        return $this->model->update($id, $data);
    }

    public function delete($id)
    {
        return $this->model->delete($id);
    }
}
`;
}

export function renderCi4Model(ctx: ResourceContext): string {
  const { className, tableName } = ctx;
  const allowed = ctx.fields.map((field) => `'${field.name}'`).join(", ");
  const rules = ctx.fields
    .map((field) => `            '${field.name}' => '${ci4Rule(field)}',`)
    .join("\n");
  return `<?php

namespace App\\Models;

use CodeIgniter\\Model;

class ${className}Model extends Model
{
    protected $DBGroup          = 'default';
    protected $table            = '${tableName}';
    protected $primaryKey       = 'id';
    protected $useAutoIncrement = true;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $protectFields    = true;
    protected $allowedFields    = [${allowed}];

    protected $useTimestamps = true;
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';

    protected $validationRules = [
${rules}
    ];
    protected $validationMessages = [];
    protected $skipValidation    = false;
}
`;
}

export function renderCi4Migration(ctx: ResourceContext, timestamp: string): string {
  const { className, tableName } = ctx;
  const classNamePascal = `Create${snakeToPascal(tableName)}`;
  const columns = ctx.fields.map((field) => columnDef(ctx, field)).join("\n");
  return `<?php

namespace App\\Database\\Migrations;

use CodeIgniter\\Database\\Migration;

class ${classNamePascal} extends Migration
{
    public function up()
    {
        $this->forge->addField([
            'id' => [
                'type'           => 'INT',
                'constraint'     => 11,
                'unsigned'       => true,
                'auto_increment' => true,
            ],
${columns}
            'created_at' => [
                'type' => 'DATETIME',
                'null' => true,
            ],
            'updated_at' => [
                'type' => 'DATETIME',
                'null' => true,
            ],
        ]);
        $this->forge->addKey('id', true);
        $this->forge->createTable('${tableName}', true);
    }

    public function down()
    {
        $this->forge->dropTable('${tableName}', true);
    }
}
`;
}

export function renderCi4View(ctx: ResourceContext): string {
  const { className, kebabName } = ctx;
  const headers = ctx.fields.map((field) => `<th>${field.name}</th>`).join("\n        ");
  const cells = ctx.fields
    .map((field) => `<td><?= esc($item['${field.name}']) ?></td>`)
    .join("\n          ");
  return `<h1>${className} list</h1>

<table border="1" cellpadding="6" cellspacing="0">
    <thead>
        <tr>
            <th>ID</th>
        ${headers}
            <th>Actions</th>
        </tr>
    </thead>
    <tbody>
    <?php foreach ($items as $item): ?>
        <tr>
            <td><?= esc($item['id']) ?></td>
          ${cells}
            <td>
                <a href="<?= url_to('${kebabName}::edit', $item['id']) ?>">Edit</a>
                <a href="<?= url_to('${kebabName}::delete', $item['id']) ?>"
                   onclick="return confirm('Delete this record?')">Delete</a>
            </td>
        </tr>
    <?php endforeach; ?>
    </tbody>
</table>

<a href="<?= url_to('${kebabName}::create') ?>">Create new</a>
`;
}

/** CI4 model test (PHPUnit, CI4 test infra). */
export function renderCi4ModelTest(ctx: ResourceContext): string {
  const { className, tableName } = ctx;
  return `<?php

namespace Tests\\Unit;

use App\\Models\\${className}Model;
use CodeIgniter\\Test\\CIUnitTestCase;

final class ${className}ModelTest extends CIUnitTestCase
{
    public function testModelHasTable(): void
    {
        $model = new ${className}Model();
        $this->assertSame('${tableName}', $model->table);
    }

    public function testModelHasValidationRules(): void
    {
        $model = new ${className}Model();
        $this->assertNotEmpty($model->getValidationRules());
    }
}
`;
}
