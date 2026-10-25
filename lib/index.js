import { CAPABILITY_SECTION, capabilityProtocolText } from "./capability.js";
import { GLOBAL_PROMPT_ORDER, adaptInjectForMinimalPreset, escapeDshInterpolation, isMnemonPluginMessage, isRedteamSession, modePromptText, peelChatmlEnvelope, rewritePromptAssembly } from "./identity.js";
import { mergeConfig } from "./config.js";
import { findDshHome } from "./home.js";
import { injectStatus, readInjectText, seedPromptInject } from "./inject-store.js";
import { installWebRoutes } from "./web/routes.js";
import { installSubagentRoleCapture, resolveSubagentRoleText } from "./redteam/role-section.js";
// src/index.ts
const name = "dsh-purge";
const inject = ["systemPrompt", "tools"];
function log(config, ...args) {
	if (config.verbose) console.log("[dsh-purge]", ...args);
}
function resolvePromptCwd(context) {
	try {
		const session = context.agent?.session;
		if (session) {
			try {
				const cordis = context.agent?.ctx;
				const wd = (typeof cordis?.get === "function" ? cordis.get("workingDirectory") : void 0) || cordis?.workingDirectory;
				if (wd && typeof wd.get === "function") {
					const live = wd.get(session);
					if (typeof live === "string" && live.trim()) return live.trim();
				}
			} catch {}
			const header = String(session.header?.cwd || "").trim();
			if (header) return header;
		}
	} catch {}
	try {
		return process.cwd();
	} catch {
		return "";
	}
}
function addPromptSection(ctx, section) {
	const hosts = [];
	const push = (host) => {
		if (host && !hosts.includes(host)) hosts.push(host);
	};
	try {
		push(ctx.systemPrompt?.ctx);
	} catch {}
	push(ctx);
	const disposers = [];
	let registered = false;
	let lastError = null;
	for (const host of hosts) try {
		const prompt = host.systemPrompt;
		if (!prompt) continue;
		const d = prompt.section(section);
		registered = true;
		if (typeof d === "function") disposers.push(d);
	} catch (error) {
		if ((error instanceof Error ? error.message : String(error)).includes("already registered")) registered = true;
		else lastError = error;
	}
	if (!registered && lastError) throw lastError;
	if (disposers.length && typeof ctx.effect === "function") try {
		ctx.effect(() => () => {
			for (const d of disposers) try {
				d();
			} catch {}
		});
	} catch {}
}
function registerCwdVariable(ctx) {
	const hosts = [];
	const push = (host) => {
		if (host && !hosts.includes(host)) hosts.push(host);
	};
	try {
		push(ctx.systemPrompt?.ctx);
	} catch {}
	push(ctx);
	const disposers = [];
	for (const host of hosts) try {
		const prompt = host.systemPrompt;
		if (!prompt || typeof prompt.variable !== "function") continue;
		const d = prompt.variable("cwd", (context) => resolvePromptCwd(context) || void 0);
		if (typeof d === "function") disposers.push(d);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		if (!msg.includes("already registered")) console.warn("[dsh-purge] register cwd variable:", msg);
	}
	if (disposers.length && typeof ctx.effect === "function") try {
		ctx.effect(() => () => {
			for (const d of disposers) try {
				d();
			} catch {}
		});
	} catch {}
}
function readInjectFallback(context) {
	const text = readInjectText(findDshHome());
	if (!text) return "";
	return modePromptText(text, isRedteamSession(context));
}
function registerPromptSections(ctx, config) {
	registerCwdVariable(ctx);
	addPromptSection(ctx, {
		name: "dsh-purge",
		order: GLOBAL_PROMPT_ORDER,
		interpolate: false,
		text: (context) => {
			if (!config.enabled) return "";
			return escapeDshInterpolation(peelChatmlEnvelope(adaptInjectForMinimalPreset(readInjectFallback(context))));
		}
	});
	if (config.capabilityProtocol) addPromptSection(ctx, {
		name: CAPABILITY_SECTION,
		order: GLOBAL_PROMPT_ORDER + 1,
		interpolate: false,
		text: (context) => {
			if (!config.enabled) return "";
			const redteam = isRedteamSession(context);
			const session = context.agent?.session;
			return capabilityProtocolText({
				redteam,
				redteamChild: Boolean(redteam && session?.header?.origin === "subagent"),
				enabled: true
			});
		}
	});
	const postPrompt = config.postPrompt.trim();
	if (!postPrompt) return;
	if (!Number.isFinite(config.postPromptOrder) || config.postPromptOrder <= -1e5) {
		console.warn(`[dsh-purge] postPromptOrder (${config.postPromptOrder}) must be > ${GLOBAL_PROMPT_ORDER}; skipping`);
		return;
	}
	addPromptSection(ctx, {
		name: "dsh-purge:post",
		order: config.postPromptOrder,
		text: () => config.enabled ? postPrompt : ""
	});
}
function rewriteLiveAssembly(config, assembled, context) {
	const enabled = config.enabled;
	const redteam = enabled && isRedteamSession(context);
	const injectText = enabled ? readInjectFallback(context) : "";
	const cwd = resolvePromptCwd(context);
	const roleText = redteam ? resolveSubagentRoleText(context) : "";
	const rewritten = rewritePromptAssembly(assembled, {
		fallbackInject: injectText,
		dropMnemon: config.stripMnemon,
		capabilityProtocol: config.capabilityProtocol,
		context,
		roleText
	});
	const variables = { ...rewritten.variables || assembled.variables || {} };
	if (cwd) variables.cwd = cwd;
	return {
		...rewritten,
		variables
	};
}
function installAssembleWaterfall(ctx, config) {
	if (typeof ctx.on !== "function") return;
	const handler = async (_assembly, context, next) => {
		const assembled = await next();
		if (!config.enabled) return assembled;
		try {
			return rewriteLiveAssembly(config, assembled, context);
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			console.warn("[dsh-purge] assemble rewrite failed:", msg);
			return assembled;
		}
	};
	try {
		const dispose = ctx.on("system-prompt/assemble", handler, { global: true });
		if (typeof dispose === "function" && typeof ctx.effect === "function") ctx.effect(() => () => {
			try {
				dispose();
			} catch {}
		});
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		console.warn("[dsh-purge] assemble waterfall:", msg);
	}
}
function installMnemonMessageStrip(ctx, config) {
	if (typeof ctx.on !== "function") return;
	const strip = config.stripMnemon;
	const wrap = async (_payload, next) => {
		const decision = await next();
		if (!decision) return decision;
		const incoming = Array.isArray(decision.messages) ? decision.messages : [];
		const messages = strip ? incoming.filter((m) => !isMnemonPluginMessage(m)) : incoming;
		if (messages.length === incoming.length && Array.isArray(decision.messages)) return decision;
		return {
			...decision,
			messages
		};
	};
	try {
		const dispose = ctx.on("agent/pre-step", wrap, {
			global: true,
			prepend: true
		});
		if (typeof dispose === "function" && typeof ctx.effect === "function") ctx.effect(() => () => {
			try {
				dispose();
			} catch {}
		});
	} catch {}
}
function installStatusTool(ctx) {
	if (!ctx.tools?.register) return;
	try {
		ctx.tools.register({
			name: "purge_status",
			description: "Show dsh-purge runtime status (Cordis inject, prompt-inject.md; no host disk patches).",
			parameters: {
				type: "object",
				additionalProperties: false,
				properties: {}
			},
			output: {
				schema: {
					type: "object",
					additionalProperties: false,
					properties: { text: { type: "string" } }
				},
				render: (_args, value) => [{
					type: "text",
					text: String(value?.text ?? "")
				}]
			},
			async execute() {
				const st = injectStatus(findDshHome());
				return { text: [
					"dsh-purge 2.x (web / cordis-runtime)",
					`DSH_HOME: ${st.dsh_home}`,
					`inject: ${st.override_path} (${st.override_status}, ${st.override_bytes} bytes)`,
					"host patches: removed — runtime systemPrompt only"
				].join("\n") };
			}
		});
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		console.warn("[dsh-purge] tools.register:", msg);
	}
}
function apply(ctx, config = {}) {
	const cfg = mergeConfig(config);
	if (!cfg.enabled) {
		log(cfg, "disabled");
		return;
	}
	try {
		const seed = seedPromptInject(findDshHome());
		log(cfg, "seed prompt-inject:", seed.action, seed.path);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		console.warn("[dsh-purge] seed prompt-inject:", msg);
	}
	registerPromptSections(ctx, cfg);
	installAssembleWaterfall(ctx, cfg);
	installMnemonMessageStrip(ctx, cfg);
	try {
		installSubagentRoleCapture(ctx);
	} catch {}
	installStatusTool(ctx);
	installWebRoutes(ctx, cfg);
	log(cfg, "ready (web cordis-runtime)");
}
const plugin = {
	name,
	inject,
	apply
};
export { apply, plugin as default, inject, name, registerPromptSections };
