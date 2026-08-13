/**
 * Integration tests over the real MCP protocol (InMemoryTransport).
 *
 * Verifies that the registered server exposes the 7 tools + 4 resources
 * and that protocol calls return structured results
 * (never exceptions that break the session).
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildServer,
  PROMPT_NAMES,
  RESOURCE_URIS,
  TOOL_NAMES,
} from "../../src/server.js";
import { createTestContext, extractToolText, type TestContext } from "../helpers.js";

/** Extracts the JSON block from a prompt message (between ```json and ```). */
function jsonFromPrompt(text: string): Record<string, unknown> {
  const match = /```json\n([\s\S]*?)\n```/.exec(text);
  expect(match).not.toBeNull();
  return JSON.parse(match![1]!) as Record<string, unknown>;
}

/** Extracts the text of the first message of a GetPromptResult. */
function promptText(result: {
  messages: Array<{ content: { type: string; text?: string } }>;
}): string {
  const content = result.messages[0]!.content;
  return content.type === "text" ? content.text ?? "" : "";
}

interface RunningServer {
  client: Client;
  close: () => Promise<void>;
  ctx: TestContext;
}

async function startTestServer(): Promise<RunningServer> {
  const ctx = createTestContext();
  const server = buildServer(ctx.deps);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return {
    client,
    ctx,
    close: async () => {
      await client.close();
      ctx.cleanup();
    },
  };
}

const PRODUCT_ARGS = {
  resourceName: "Product",
  fields: [
    { name: "title", type: "string", required: true, validation: "max:255" },
    { name: "price", type: "float", required: true },
  ],
};

describe("MCP server (protocol)", () => {
  let running: RunningServer | undefined;

  afterEach(async () => {
    await running?.close();
    running = undefined;
  });

  it("exposes the 7 tools defined in the spec", async () => {
    running = await startTestServer();
    const { tools } = await running.client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([...TOOL_NAMES].sort());
  });

  it("exposes the 4 convention resources", async () => {
    running = await startTestServer();
    const { resources } = await running.client.listResources();
    const uris = resources.map((r) => r.uri).sort();
    expect(uris).toEqual([...RESOURCE_URIS].sort());

    const read = await running.client.readResource({
      uri: "convention://naming",
    });
    expect(read.contents[0]).toMatchObject({
      mimeType: "text/markdown",
    });
    const text = (read.contents[0] as { text?: string }).text ?? "";
    expect(text).toContain("PascalCase");
    expect(text).toContain("kebab-case");
  });

  it("scaffold_full_resource over the protocol returns the full CRUD", async () => {
    running = await startTestServer();
    const result = await running.client.callTool({
      name: "scaffold_full_resource",
      arguments: PRODUCT_ARGS,
    });
    const payload = JSON.parse(extractToolText(result)) as {
      success: boolean;
      filesCreated: string[];
    };
    expect(payload.success).toBe(true);
    expect(payload.filesCreated).toHaveLength(8);
    expect(payload.filesCreated[0]).toBe("app/Controllers/ProductController.php");
  });

  it("run_migration without confirm returns DestructiveOpBlockedError without executing", async () => {
    running = await startTestServer();
    const result = await running.client.callTool({
      name: "run_migration",
      arguments: { direction: "up", confirm: false },
    });
    const payload = JSON.parse(extractToolText(result)) as {
      success: boolean;
      error?: { type: string };
    };
    expect(payload.success).toBe(false);
    expect(payload.error?.type).toBe("DestructiveOpBlockedError");
    expect(running.ctx.executor.calls).toHaveLength(0);
  });

  it("scaffold_controller rejects invalid input without breaking the session", async () => {
    running = await startTestServer();
    // The SDK validates the input against the schema BEFORE the tool:
    // it responds with an MCP error (isError) without invoking the callback.
    const result = await running.client.callTool({
      name: "scaffold_controller",
      arguments: { resourceName: "product" },
    });
    const text = extractToolText(result);
    expect(text).toContain("Input validation error");
    expect((result as { isError?: boolean }).isError).toBe(true);

    // The session stays alive: a valid call afterwards works.
    const ok = await running.client.callTool({
      name: "scaffold_controller",
      arguments: { resourceName: "Product" },
    });
    const okPayload = JSON.parse(extractToolText(ok)) as {
      success: boolean;
    };
    expect(okPayload.success).toBe(true);
  });

  it("validate_route over the protocol detects real collisions", async () => {
    running = await startTestServer();
    // First register a route in the target project's Routes.php.
    const { writeInAppRoot } = await import("../helpers.js");
    writeInAppRoot(
      running.ctx.root,
      "app/Config/Routes.php",
      `<?php\n\n$routes->get('/products/{id}', 'ProductController::show');\n`,
    );

    const result = await running.client.callTool({
      name: "validate_route",
      arguments: { method: "GET", path: "/products/{slug}" },
    });
    const payload = JSON.parse(extractToolText(result)) as {
      valid: boolean;
      conflicts: Array<{ reason: string }>;
    };
    expect(payload.valid).toBe(false);
    expect(payload.conflicts[0]!.reason).toContain("Pattern collision");
  });

  it("lint_against_framework_rules over the protocol on generated code", async () => {
    running = await startTestServer();
    await running.client.callTool({
      name: "scaffold_full_resource",
      arguments: PRODUCT_ARGS,
    });

    const result = await running.client.callTool({
      name: "lint_against_framework_rules",
      arguments: { filePath: "app/Controllers/ProductController.php" },
    });
    const payload = JSON.parse(extractToolText(result)) as {
      success: boolean;
      compliant: boolean;
    };
    expect(payload.success).toBe(true);
    expect(payload.compliant).toBe(true);
  });

  it("exposes the 3 token-saving prompts", async () => {
    running = await startTestServer();
    const { prompts } = await running.client.listPrompts();
    const names = prompts.map((p) => p.name).sort();
    expect(names).toEqual([...PROMPT_NAMES].sort());
  });

  it("create_full_resource builds ready-to-call scaffold arguments from compact fields", async () => {
    running = await startTestServer();
    const result = await running.client.getPrompt({
      name: "create_full_resource",
      arguments: {
        resource: "Appointment",
        fields: "patientId:int:true, reason:string, note:text:false",
      },
    });
    const text = promptText(result);
    expect(text).toContain("scaffold_full_resource");
    expect(text).toContain("overwrite is not set");
    const payload = jsonFromPrompt(text);
    expect(payload.resourceName).toBe("Appointment");
    expect(payload.fields).toEqual([
      { name: "patientId", type: "int", required: true },
      { name: "reason", type: "string", required: true },
      { name: "note", type: "text", required: false },
    ]);
    expect(payload.withTests).toBe(true);
    expect(payload.overwrite).toBe(false);
  });

  it("create_full_resource rejects an unknown field type with a clear error", async () => {
    running = await startTestServer();
    await expect(
      running.client.getPrompt({
        name: "create_full_resource",
        arguments: { resource: "Appointment", fields: "when:datetime" },
      }),
    ).rejects.toThrow();
  });

  it("run_migration prompt enforces the explicit confirm security rule", async () => {
    running = await startTestServer();
    const result = await running.client.getPrompt({
      name: "run_migration",
      arguments: { direction: "up", confirm: "true" },
    });
    const text = promptText(result);
    expect(text).toContain("run_migration");
    expect(text).toContain("Security rule");
    expect(jsonFromPrompt(text)).toEqual({ direction: "up", confirm: true });
  });

  it("lint_file prompt builds the filePath argument", async () => {
    running = await startTestServer();
    const result = await running.client.getPrompt({
      name: "lint_file",
      arguments: { filePath: "app/Controllers/Home.php" },
    });
    const text = promptText(result);
    expect(text).toContain("lint_against_framework_rules");
    expect(jsonFromPrompt(text)).toEqual({
      filePath: "app/Controllers/Home.php",
    });
  });
});
