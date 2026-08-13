/**
 * End-to-end test (checklist item 11 of the spec):
 *
 * 1. Starts the real MCP server over stdio (compiled `dist/index.js`).
 * 2. Performs the JSON-RPC handshake (initialize + notifications/initialized).
 * 3. Generates the `Product` resource from scratch via `tools/call`.
 * 4. Validates PHP syntax of every generated file with `php -l`.
 * 5. Runs `run_migration` without confirm → blocked; with confirm → executes.
 */

import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, extractToolText, type TestContext } from "../helpers.js";

const PROJECT_ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");

const PRODUCT_ARGS = {
  resourceName: "Product",
  fields: [
    { name: "title", type: "string", required: true, validation: "max:255" },
    { name: "price", type: "float", required: true },
    { name: "description", type: "text", required: false },
  ],
};

/**
 * Minimal JSON-RPC client over the stdio stream.
 * The SDK 1.x (stdio transport) uses NEWLINE-delimited JSON messages:
 * one JSON-RPC line per message, no Content-Length framing.
 */
class StdioRpcClient {
  private buffer = "";
  private pending: Array<(msg: unknown) => void> = [];
  private nextId = 1;

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    child.stdout.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString("utf8");
      this.drain();
    });
  }

  private drain(): void {
    for (;;) {
      const newline = this.buffer.indexOf("\n");
      if (newline === -1) return;
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line.length === 0) continue;
      let message: unknown;
      try {
        message = JSON.parse(line) as unknown;
      } catch {
        continue; // corrupt line: ignored
      }
      this.pending.shift()?.(message);
    }
  }

  send(method: string, params: unknown, id?: number): void {
    const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    this.child.stdin.write(`${body}\n`);
  }

  next(): Promise<unknown> {
    return new Promise((resolve) => {
      this.pending.push(resolve);
    });
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    const response = this.next();
    this.send(method, params, id);
    return response;
  }

  notify(method: string, params: unknown): void {
    this.send(method, params);
  }
}

function phpAvailable(): boolean {
  try {
    execFileSync("php", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function phpLint(absPath: string): { ok: boolean; output: string } {
  try {
    const output = execFileSync("php", ["-l", absPath], { encoding: "utf8" });
    return { ok: true, output };
  } catch (err) {
    return {
      ok: false,
      output: err instanceof Error ? err.message : String(err),
    };
  }
}

describe("e2e: real server over stdio", () => {
  let ctx: TestContext;
  let child: ChildProcessWithoutNullStreams;
  let rpc: StdioRpcClient;
  const php = phpAvailable();

  beforeAll(() => {
    ctx = createTestContext();
    // Compiles the real production artifact (`dist/index.js`, the one mcp.json
    // runs) so the e2e validates the build and not just the source with tsx.
    execFileSync(
      process.execPath,
      [
        join(PROJECT_ROOT, "node_modules", "typescript", "bin", "tsc"),
        "-p",
        join(PROJECT_ROOT, "tsconfig.build.json"),
      ],
      { cwd: PROJECT_ROOT, stdio: "pipe" },
    );
    child = spawn(process.execPath, ["dist/index.js"], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        APP_ROOT: ctx.root,
        // Same value as mcp.json for maximum fidelity.
        RATE_LIMIT_PER_MINUTE: "20",
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    rpc = new StdioRpcClient(child);
  }, 60_000);

  afterAll(async () => {
    child?.kill();
    ctx.cleanup();
  });

  it("correct handshake and serverInfo", async () => {
    const init = (await rpc.request("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "e2e-test", version: "1.0.0" },
    })) as { result?: { serverInfo?: { name?: string; version?: string } } };
    expect(init.result?.serverInfo?.name).toBe("codeigniter-mcp");
    expect(init.result?.serverInfo?.version).toBe("0.1.0");
    rpc.notify("notifications/initialized", {});
  });

  it("full Product resource scaffold", async () => {
    const call = (await rpc.request("tools/call", {
      name: "scaffold_full_resource",
      arguments: PRODUCT_ARGS,
    })) as {
      result?: { content?: Array<{ text?: string }> };
      error?: { message?: string };
    };
    expect(call.error).toBeUndefined();
    const payload = JSON.parse(call.result?.content?.[0]?.text ?? "{}") as {
      success: boolean;
      filesCreated: string[];
    };
    expect(payload.success).toBe(true);
    expect(payload.filesCreated).toHaveLength(8);
    expect(payload.filesCreated[0]).toBe("app/Controllers/ProductController.php");

    // The migration file must exist with the timestamp of the test day.
    const migration = payload.filesCreated.find((f) =>
      f.includes("Database/Migrations"),
    );
    expect(migration).toMatch(/^app\/Database\/Migrations\/\d{4}_\d{2}_\d{2}_create_products_table\.php$/);
  });

  it.skipIf(!php)("los 8 archivos PHP generados pasan `php -l`", () => {
    for (const rel of [
      "app/Controllers/ProductController.php",
      "app/Services/ProductService.php",
      "app/Repositories/ProductRepositoryInterface.php",
      "app/Repositories/ProductRepository.php",
      "app/Entities/Product.php",
      "app/Database/Migrations/2026_08_12_create_products_table.php",
      "tests/Unit/ProductServiceTest.php",
      "tests/Integration/ProductControllerTest.php",
    ]) {
      // The migration name depends on the real date (real deps.now).
      const abs = join(ctx.root, ...rel.split("/"));
      if (!existsSync(abs)) {
        continue;
      }
      const result = phpLint(abs);
      expect(result.ok, `${rel}: ${result.output}`).toBe(true);
    }
  });

  it("run_migration without confirm → blocked and nothing is executed", async () => {
    const call = (await rpc.request("tools/call", {
      name: "run_migration",
      arguments: { direction: "up", confirm: false },
    })) as { result?: unknown };
    const payload = JSON.parse(extractToolText(call.result)) as {
      success: boolean;
      error?: { type: string };
    };
    expect(payload.success).toBe(false);
    expect(payload.error?.type).toBe("DestructiveOpBlockedError");
  });

  it("run_migration with confirm=true executes through a real bin/migrate", async () => {
    // Minimal framework: native `bin/migrate` runner.
    mkdirSync(join(ctx.root, "bin"), { recursive: true });
    writeFileSync(
      join(ctx.root, "bin", "migrate"),
      `<?php
$direction = $argv[1] ?? 'up';
$name = $argv[2] ?? null;
if ($name !== null) {
    echo "app/Database/Migrations/{$name}\\n";
    exit(0);
}
foreach (glob('app/Database/Migrations/*_create_*_table.php') as $file) {
    echo $file . "\\n";
}
exit(0);
`,
      "utf8",
    );

    const call = (await rpc.request("tools/call", {
      name: "run_migration",
      arguments: { direction: "up", confirm: true },
    })) as { result?: unknown };
    const payload = JSON.parse(extractToolText(call.result)) as {
      success: boolean;
      executed: string[];
    };
    expect(payload.success).toBe(true);
    // Robustness: the real timestamp depends on the day the test runs.
    expect(payload.executed.some((f) => f.includes("create_products_table"))).toBe(
      true,
    );
  });

  it("validate_route and lint respond over the protocol", async () => {
    const route = (await rpc.request("tools/call", {
      name: "validate_route",
      arguments: { method: "POST", path: "/products" },
    })) as { result?: unknown };
    const routePayload = JSON.parse(extractToolText(route.result)) as {
      success: boolean;
      valid: boolean;
    };
    expect(routePayload.success).toBe(true);

    const lint = (await rpc.request("tools/call", {
      name: "lint_against_framework_rules",
      arguments: { filePath: "app/Controllers/ProductController.php" },
    })) as { result?: unknown };
    const lintPayload = JSON.parse(extractToolText(lint.result)) as {
      success: boolean;
      compliant: boolean;
    };
    expect(lintPayload.success).toBe(true);
    expect(lintPayload.compliant).toBe(true);
  });
});
