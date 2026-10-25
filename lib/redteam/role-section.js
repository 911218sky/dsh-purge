import { isRedteamSession } from "../identity.js";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
// src/redteam/role-section.ts
const ROLE_TAG = /^[ \t]*redteamRole:[ \t]*(recon|assess|vuln-scan|exploit|internal)[ \t]*$/im;
const roleBySession = /* @__PURE__ */ new Map();
const ROLE_SESSION_CAP = 400;
function redteamRoot() {
	return process.env.DSH_HOME ? join(process.env.DSH_HOME, "redteam") : join(homedir(), ".dsh", "redteam");
}
function parseRedteamRole(text) {
	const matched = text.match(ROLE_TAG);
	return matched ? matched[1].toLowerCase() : "";
}
function textOfMessage(message) {
	if (!message) return "";
	if (typeof message === "string") return message;
	if (typeof message !== "object") return "";
	const record = message;
	const content = record.content ?? record.text;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content.map((block) => {
		if (typeof block === "object" && block && "text" in block) return String(block.text ?? "");
		return "";
	}).join("\n");
}
function remember(sessionId, role) {
	if (!sessionId) return;
	if (roleBySession.size >= ROLE_SESSION_CAP) {
		let i = 0;
		for (const key of roleBySession.keys()) {
			if (i++ >= 100) break;
			roleBySession.delete(key);
		}
	}
	roleBySession.set(sessionId, role);
}
function isRedteamChild(session, context) {
	const header = session?.header;
	if (header?.origin !== "subagent" && !((header?.delegationDepth ?? 0) > 0)) return false;
	return isRedteamSession({
		...context,
		session: session ?? void 0
	});
}
function resolveSubagentRoleText(context) {
	const session = context.agent?.session || context.session;
	if (!session || !isRedteamChild(session, context)) return "";
	const id = session.id ? String(session.id) : "";
	const role = id && roleBySession.get(id) || "";
	if (!role) return "";
	const fp = join(redteamRoot(), "engagements", "_shared", "agents", `${role}.md`);
	if (!existsSync(fp)) return "";
	try {
		return readFileSync(fp, "utf8").trim();
	} catch {
		return "";
	}
}
function installSubagentRoleCapture(ctx) {
	if (typeof ctx.on !== "function") return;
	const onClaim = (payload, next) => {
		const body = payload;
		const agent = body?.agent;
		const session = agent?.session;
		if (session && isRedteamChild(session, {
			agent,
			session
		})) {
			const role = parseRedteamRole(textOfMessage(body.message));
			if (role) {
				remember(session.id, role);
				if (agent?.id) remember(String(agent.id), role);
			}
		}
		return typeof next === "function" ? next() : void 0;
	};
	try {
		const dispose = ctx.on("agent/claim", onClaim, { global: true });
		if (typeof dispose === "function" && typeof ctx.effect === "function") ctx.effect(() => () => {
			try {
				dispose();
			} catch {}
		});
	} catch {}
}
export { installSubagentRoleCapture, parseRedteamRole, resolveSubagentRoleText };
