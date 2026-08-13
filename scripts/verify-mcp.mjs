#!/usr/bin/env node

/**
 * verify-mcp.mjs — end-to-end acceptance checklist for codeigniter-mcp.
 *
 * Spawns the server against a throwaway framework skeleton and verifies every
 * acceptance criterion of the spec, printing a ✅ / ❌ / ⚠️ report.
 *
 * Usage:
 *   npm run build                            # once, so dist/ is up to date
 *   node scripts/verify-mcp.mjs              # tests the local build
 *   VERIFY_MCP_COMMAND="npx -y codeigniter-mcp" node scripts/verify-mcp.mjs
 *                                            # tests the published package
 *
 * Exit code: 0 when every criterion passes, 1 otherwise.
 */

import { spawn, execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const COMMAND = (process.env.VERIFY_MCP_COMMAND ?? "node dist/index.js").split(
  /\s+/,
);
const [CMD, ...ARGS] = COMMAND;

const results = [];
const report = (ok, label, detail = "") =>
  results.push({ ok, label, detail });

function hasPhp() {
  try {
    execFileSync("php", ["-v"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function textOf(callResult) {
  const first = callResult?.result?.content?.[0];
  return typeof first?.text === "string" ? first.text : "{}";
}

/** Parses a tool payload; never throws (SDK schema errors are reported as ❌). */
function parsePayload(text) {
  try {
    return JSON.parse(text);
  } catch {
    return { success: false, error: { type: "ProtocolError", message: text } };
  }
}

/** Minimal NEWLINE-delimited JSON-RPC client (SDK 1.x stdio). */
class StdioClient {
  constructor(child) {
    this.child = child;
    this.buffer = "";
    this.pending = [];
    this.nextId = 1;
    child.stdout.on("data", (chunk) => {
      this.buffer += chunk.toString("utf8");
      this.drain();
    });
  }

  drain() {
    for (;;) {
      const nl = this.buffer.indexOf("\n");
      if (nl === -1) return;
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.id !== undefined) {
        const resolve = this.pending.shift();
        if (resolve) resolve(msg);
      }
    }
  }

  request(method, params) {
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolve) => {
      this.pending.push(resolve);
      this.child.stdin.write(payload + "\n");
    });
  }

  notify(method, params) {
    this.child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n",
    );
  }

  async close() {
    this.child.stdin.end();
    await new Promise((resolve) => {
      this.child.once("exit", resolve);
      setTimeout(resolve, 2000);
    });
  }
}

async function main() {
  const php = hasPhp();
  const root = mkdtempSync(join(tmpdir(), "codeigniter-mcp-verify-"));

  // Minimal framework skeleton inside APP_ROOT.
  mkdirSync(join(root, "app", "Config"), { recursive: true });
  writeFileSync(
    join(root, "app", "Config", "Routes.php"),
    "<?php\n// Framework routes\n",
    "utf8",
  );
  mkdirSync(join(root, "bin"), { recursive: true });
  writeFileSync(
    join(root, "bin", "migrate"),
    `<?php
$direction = $argv[1] ?? 'up';
foreach (glob('app/Database/Migrations/*_create_*_table.php') as $file) {
    echo $file . "\\n";
}
exit(0);
`,
    "utf8",
  );

  const child = spawn(CMD, ARGS, {
    env: { ...process.env, APP_ROOT: root },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stderr.on("data", () => {}); // keep stderr quiet unless it errors
  const client = new StdioClient(child);

  const orderArgs = {
    resourceName: "Order",
    fields: [
      { name: "customerId", type: "int", required: true },
      { name: "total", type: "float", required: true },
      { name: "note", type: "text", required: false },
    ],
  };

  try {
    /* 1. Handshake */
    const init = await client.request("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "verify-mcp", version: "1.0.0" },
    });
    const info = init.result?.serverInfo;
    report(
      info?.name === "codeigniter-mcp",
      "Handshake: serverInfo.name = codeigniter-mcp",
      JSON.stringify(info),
    );
    await client.notify("notifications/initialized", {});

    /* 2. Tool surface */
    const tools = await client.request("tools/list", {});
    report(
      tools.result?.tools?.length === 7,
      `Exposes 7 tools (found ${tools.result?.tools?.length ?? 0})`,
      tools.result?.tools?.map((t) => t.name).join(", "),
    );

    /* 3. Resource surface */
    const resources = await client.request("resources/list", {});
    report(
      resources.result?.resources?.length === 4,
      `Exposes 4 convention resources (found ${resources.result?.resources?.length ?? 0})`,
      resources.result?.resources?.map((r) => r.uri).join(", "),
    );

    /* 4. Full CRUD scaffold */
    const t0 = performance.now();
    const sc = await client.request("tools/call", {
      name: "scaffold_full_resource",
      arguments: orderArgs,
    });
    const ms = Math.round(performance.now() - t0);
    const scPayload = parsePayload(textOf(sc));
    const files = scPayload.filesCreated ?? [];
    const onDisk = files.filter((f) =>
      existsSync(join(root, ...f.split("/"))),
    );
    report(
      scPayload.success === true && files.length === 8 && onDisk.length === 8,
      "scaffold_full_resource creates 8 files on disk",
      `${ms} ms — ${files.join(", ")}`,
    );

    /* 5. PHP syntax of every generated file */
    if (php) {
      const bad = [];
      for (const f of files) {
        try {
          execFileSync("php", ["-l", join(root, ...f.split("/"))], {
            stdio: "ignore",
          });
        } catch {
          bad.push(f);
        }
      }
      report(bad.length === 0, "php -l passes on all generated files",
        bad.length ? bad.join(", ") : `${files.length} files OK`);
    } else {
      report(null, "php -l on generated files", "php not found — skipped");
    }

    /* 6. Generated code is framework-compliant */
    const lint = await client.request("tools/call", {
      name: "lint_against_framework_rules",
      arguments: { filePath: "app/Controllers/OrderController.php" },
    });
    const lintPayload = parsePayload(textOf(lint));
    report(
      lintPayload.success === true && lintPayload.compliant === true,
      "lint_against_framework_rules → compliant",
      JSON.stringify(lintPayload.violations ?? []),
    );

    /* 7. Route validation */
    const route = await client.request("tools/call", {
      name: "validate_route",
      arguments: { method: "POST", path: "/orders" },
    });
    const routePayload = parsePayload(textOf(route));
    report(
      routePayload.success === true && routePayload.valid === true,
      "validate_route POST /orders → valid",
      JSON.stringify(routePayload.conflicts ?? []),
    );

    /* 8. Destructive op is blocked without confirm */
    const blocked = await client.request("tools/call", {
      name: "run_migration",
      arguments: { direction: "up", confirm: false },
    });
    const blockedPayload = parsePayload(textOf(blocked));
    report(
      blockedPayload.success === false &&
        blockedPayload.error?.type === "DestructiveOpBlockedError",
      "run_migration without confirm → blocked (zero executions)",
      JSON.stringify(blockedPayload.error),
    );

    /* 9. Destructive op executes with confirm (needs php) */
    if (php) {
      const run = await client.request("tools/call", {
        name: "run_migration",
        arguments: { direction: "up", confirm: true },
      });
      const runPayload = parsePayload(textOf(run));
      report(
        runPayload.success === true && (runPayload.executed ?? []).length >= 1,
        "run_migration with confirm=true executes via bin/migrate",
        JSON.stringify(runPayload),
      );
    } else {
      report(null, "run_migration with confirm=true", "php not found — skipped");
    }

    /* 10. Overwrite protection (deterministic, non-destructive by default) */
    const again = await client.request("tools/call", {
      name: "scaffold_full_resource",
      arguments: orderArgs,
    });
    const againPayload = parsePayload(textOf(again));
    report(
      againPayload.success === true &&
        (againPayload.filesSkipped ?? []).length === 8,
      "scaffold again → no overwrite, 8 files skipped",
      JSON.stringify(againPayload.filesSkipped),
    );

    /* 11. Path traversal is blocked */
    const evil = await client.request("tools/call", {
      name: "lint_against_framework_rules",
      arguments: { filePath: "../../etc/passwd" },
    });
    const evilPayload = parsePayload(textOf(evil));
    report(
      evilPayload.success === false &&
        evilPayload.error?.type === "ValidationError",
      "Path traversal outside APP_ROOT → ValidationError",
      JSON.stringify(evilPayload.error),
    );
  } finally {
    await client.close();
    rmSync(root, { recursive: true, force: true });
  }

  /* Report */
  console.log("\ncodeigniter-mcp — acceptance checklist\n");
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const r of results) {
    if (r.ok === null) {
      skipped += 1;
      console.log(`  ⚠️  ${r.label}`);
    } else if (r.ok) {
      passed += 1;
      console.log(`  ✅  ${r.label}`);
    } else {
      failed += 1;
      console.log(`  ❌  ${r.label}${r.detail ? `\n      → ${r.detail}` : ""}`);
    }
    if (r.detail && r.ok === true) {
      console.log(`      → ${r.detail}`);
    }
  }
  console.log(
    `\nResult: ${passed} passed · ${failed} failed · ${skipped} skipped\n`,
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
