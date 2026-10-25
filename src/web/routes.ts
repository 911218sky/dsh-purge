import type { IncomingMessage, ServerResponse } from "node:http";
import type { ResolvedConfig } from "../config.js";
import { findDshHome } from "../home.js";
import { injectStatus, readInjectText, writeInjectText } from "../inject-store.js";
import type { PromptSaveBody, PurgeContext, WebServerService } from "../types.js";

function headerOf(request: IncomingMessage, name: string): string {
  const headers = request.headers;
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return String(value[0] || "");
  return String(value || "");
}

function denyCrossOrigin(response: ServerResponse): void {
  response.writeHead(403, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify({ ok: false, error: "cross-origin denied" }));
}

function allowPluginRequest(request: IncomingMessage, response: ServerResponse): boolean {
  const origin = headerOf(request, "origin");
  if (!origin) return true;
  try {
    const host = headerOf(request, "host");
    const u = new URL(origin);
    if (u.host === host || u.hostname === "localhost" || u.hostname === "127.0.0.1") {
      return true;
    }
  } catch {
    /* deny */
  }
  denyCrossOrigin(response);
  return false;
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request: IncomingMessage, maxBytes = 512 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) throw new Error("body too large");
    chunks.push(buf);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as unknown;
}

function isPromptSaveBody(value: unknown): value is PromptSaveBody {
  return typeof value === "object" && value !== null;
}

const registeredRoutes = new Set<string>();

function registerRoute(
  webServer: WebServerService,
  spec: {
    method: string;
    path: string;
    handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;
  },
): void {
  const key = `${spec.method.toUpperCase()} ${spec.path}`;
  if (registeredRoutes.has(key)) return;
  try {
    webServer.register(spec);
    registeredRoutes.add(key);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!msg.includes("already")) {
      console.warn("[dsh-purge] route register:", msg);
    } else {
      registeredRoutes.add(key);
    }
  }
}

function attachRoutes(webServer: WebServerService): void {
  registerRoute(webServer, {
    method: "GET",
    path: "/dsh-purge/status",
    handler: (request, response) => {
      if (!allowPluginRequest(request, response)) return;
      sendJson(response, 200, { ok: true, ...injectStatus(findDshHome()) });
    },
  });

  registerRoute(webServer, {
    method: "GET",
    path: "/dsh-purge/prompt",
    handler: (request, response) => {
      if (!allowPluginRequest(request, response)) return;
      const text = readInjectText(findDshHome());
      sendJson(response, 200, { ok: true, text, ...injectStatus(findDshHome()) });
    },
  });

  registerRoute(webServer, {
    method: "POST",
    path: "/dsh-purge/prompt",
    handler: async (request, response) => {
      if (!allowPluginRequest(request, response)) return;
      try {
        const body = await readJsonBody(request);
        const text = isPromptSaveBody(body) ? String(body.text ?? "") : "";
        const fp = writeInjectText(text, findDshHome());
        sendJson(response, 200, { ok: true, path: fp, ...injectStatus(findDshHome()) });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        sendJson(response, 400, { ok: false, error: msg });
      }
    },
  });
}

export function installWebRoutes(ctx: PurgeContext, _config: ResolvedConfig): void {
  const attach = (host: PurgeContext): void => {
    const webServer =
      (typeof host.get === "function" ? (host.get("webServer") as WebServerService | undefined) : undefined) ||
      (host as PurgeContext & { webServer?: WebServerService }).webServer;
    if (!webServer || typeof webServer.register !== "function") return;
    attachRoutes(webServer);
  };

  if (typeof ctx.inject === "function") {
    try {
      ctx.inject(["webServer"], (host) => attach(host));
      return;
    } catch {
      /* fall through */
    }
  }
  attach(ctx);
}
