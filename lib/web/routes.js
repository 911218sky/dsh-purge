import { findDshHome } from "../home.js";
import { injectStatus, readInjectText, writeInjectText } from "../inject-store.js";
// src/web/routes.ts
function headerOf(request, name) {
	const headers = request.headers;
	const value = headers[name] ?? headers[name.toLowerCase()];
	if (Array.isArray(value)) return String(value[0] || "");
	return String(value || "");
}
function denyCrossOrigin(response) {
	response.writeHead(403, {
		"cache-control": "no-store",
		"content-type": "application/json; charset=utf-8"
	});
	response.end(JSON.stringify({
		ok: false,
		error: "cross-origin denied"
	}));
}
function allowPluginRequest(request, response) {
	const origin = headerOf(request, "origin");
	if (!origin) return true;
	try {
		const host = headerOf(request, "host");
		const u = new URL(origin);
		if (u.host === host || u.hostname === "localhost" || u.hostname === "127.0.0.1") return true;
	} catch {}
	denyCrossOrigin(response);
	return false;
}
function sendJson(response, status, payload) {
	response.writeHead(status, {
		"cache-control": "no-store",
		"content-type": "application/json; charset=utf-8"
	});
	response.end(JSON.stringify(payload));
}
async function readJsonBody(request, maxBytes = 524288) {
	const chunks = [];
	let total = 0;
	for await (const chunk of request) {
		const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		total += buf.length;
		if (total > maxBytes) throw new Error("body too large");
		chunks.push(buf);
	}
	if (!chunks.length) return {};
	return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
function isPromptSaveBody(value) {
	return typeof value === "object" && value !== null;
}
const registeredRoutes = /* @__PURE__ */ new Set();
function registerRoute(webServer, spec) {
	const key = `${spec.method.toUpperCase()} ${spec.path}`;
	if (registeredRoutes.has(key)) return;
	try {
		webServer.register(spec);
		registeredRoutes.add(key);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		if (!msg.includes("already")) console.warn("[dsh-purge] route register:", msg);
		else registeredRoutes.add(key);
	}
}
function attachRoutes(webServer) {
	registerRoute(webServer, {
		method: "GET",
		path: "/dsh-purge/status",
		handler: (request, response) => {
			if (!allowPluginRequest(request, response)) return;
			sendJson(response, 200, {
				ok: true,
				...injectStatus(findDshHome())
			});
		}
	});
	registerRoute(webServer, {
		method: "GET",
		path: "/dsh-purge/prompt",
		handler: (request, response) => {
			if (!allowPluginRequest(request, response)) return;
			sendJson(response, 200, {
				ok: true,
				text: readInjectText(findDshHome()),
				...injectStatus(findDshHome())
			});
		}
	});
	registerRoute(webServer, {
		method: "POST",
		path: "/dsh-purge/prompt",
		handler: async (request, response) => {
			if (!allowPluginRequest(request, response)) return;
			try {
				const body = await readJsonBody(request);
				const text = isPromptSaveBody(body) ? String(body.text ?? "") : "";
				sendJson(response, 200, {
					ok: true,
					path: writeInjectText(text, findDshHome()),
					...injectStatus(findDshHome())
				});
			} catch (error) {
				sendJson(response, 400, {
					ok: false,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}
	});
}
function installWebRoutes(ctx, _config) {
	const attach = (host) => {
		const webServer = (typeof host.get === "function" ? host.get("webServer") : void 0) || host.webServer;
		if (!webServer || typeof webServer.register !== "function") return;
		attachRoutes(webServer);
	};
	if (typeof ctx.inject === "function") try {
		ctx.inject(["webServer"], (host) => attach(host));
		return;
	} catch {}
	attach(ctx);
}
export { installWebRoutes };
