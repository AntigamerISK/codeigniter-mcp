/**
 * Streamable HTTP transport (remote use, `MCP_TRANSPORT=http`).
 *
 * Hardening included (audit findings):
 * - try/catch around `handleRequest` → 500 response + stderr log
 *   (prevents the unhandled rejection that would crash the process on Node >= 15).
 * - `listen` 'error' handling → the promise rejects with a clear message
 *   (EADDRINUSE and similar) instead of hanging or crashing without context.
 * - Body size limit via the Content-Length header (basic anti-DoS).
 */

import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

/** Max accepted body per request (anti-DoS hardening). */
export const MAX_HTTP_BODY_BYTES = 10 * 1024 * 1024; // 10 MB

export interface HttpTransportHandle {
  transport: StreamableHTTPServerTransport;
  /** Port actually bound (useful with port 0 in tests). */
  port: number;
  httpServer: Server;
  close: () => Promise<void>;
}

function log(message: string): void {
  // Always stderr: stdout is reserved for the JSON-RPC (stdio) protocol.
  process.stderr.write(`[codeigniter-mcp] ${message}\n`);
}

/**
 * Starts the HTTP server and returns the transport ready to connect.
 *
 * @param port     0 → ephemeral port (useful in tests).
 * @param maxBodyBytes Content-Length limit per request.
 */
export async function startHttpTransport(
  port: number,
  maxBodyBytes: number = MAX_HTTP_BODY_BYTES,
): Promise<HttpTransportHandle> {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  const httpServer = createServer(async (req, res) => {
    // Clients without SSE support only get direct responses (no GET).
    if (req.method === "GET" && !req.headers.accept?.includes("text/event-stream")) {
      res.writeHead(405, {
        "Content-Type": "application/json",
        Allow: "POST, DELETE",
      });
      res.end(JSON.stringify({ error: "Method Not Allowed. Use POST or DELETE." }));
      return;
    }

    // Body limit (best-effort; only covers requests with Content-Length).
    const contentLength = Number.parseInt(req.headers["content-length"] ?? "0", 10);
    if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Payload Too Large" }));
      return;
    }

    try {
      await transport.handleRequest(req, res);
    } catch {
      // Never let a rejection become an unhandled rejection.
      log("Error handling HTTP request. Responding 500.");
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal Server Error" }));
      } else {
        res.end();
      }
    }
  });

  const actualPort = await new Promise<number>((resolvePromise, rejectPromise) => {
    const onError = (err: Error): void => {
      httpServer.removeListener("listening", onListening);
      rejectPromise(err);
    };
    const onListening = (): void => {
      httpServer.removeListener("error", onError);
      const address = httpServer.address();
      const boundPort =
        typeof address === "object" && address !== null ? address.port : port;
      resolvePromise(boundPort);
    };
    httpServer.once("error", onError);
    httpServer.once("listening", onListening);
    httpServer.listen(port);
  });

  log(`Streamable HTTP transport listening on http://localhost:${actualPort}/`);
  return {
    transport,
    port: actualPort,
    httpServer,
    close: () => new Promise((resolvePromise) => httpServer.close(() => resolvePromise())),
  };
}
