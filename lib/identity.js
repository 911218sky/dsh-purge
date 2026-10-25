import { CAPABILITY_SECTION, capabilityProtocolText } from "./capability.js";
// src/identity.ts
const GLOBAL_PROMPT_ORDER = -1e5;
const CWD_ONLY_SUFFIX = "Your working directory is {{cwd}}.";
const INTERPOLATE_ALLOWED = /* @__PURE__ */ new Set([
	"cwd",
	"model",
	"provider"
]);
const CTF_MARK = "CTF CORE CONTRACT";
const PERSONA_PREFIX = /* @__PURE__ */ new Set(["deployment:persona-prefix", "persona-prefix"]);
const PERSONA_LEGACY = /* @__PURE__ */ new Set(["deployment:persona", "persona"]);
const PERSONA_SUFFIX = /* @__PURE__ */ new Set(["deployment:persona-suffix", "persona-suffix"]);
function isPluginPromptSection(name) {
	return name.startsWith("dsh-purge") || name.startsWith("dshpg-");
}
/** Escape unknown `{{var}}` so DSH strict interpolate does not throw. */
function escapeDshInterpolation(text) {
	if (!text.includes("{{")) return text;
	return text.replace(/\{\{([^{}]*)\}\}|(\{\{)/g, (all, name, open) => {
		if (name !== void 0 && INTERPOLATE_ALLOWED.has(name)) return all;
		if (open) return "{ {";
		return `{ {${name}}}`;
	});
}
function peelChatmlEnvelope(text) {
	let out = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
	if (!out) return out;
	out = out.replace(/<\|im_start\|>\s*system\s*:\s*<project_instructions>/gi, "<|im_start|>system:\n<project_instructions>");
	out = out.replace(/<\|im_start\|>\s*system\s*:(?!\s*\n)/gi, "<|im_start|>system:\n");
	if (/<project_instructions>/i.test(out) && !/<\/project_instructions>/i.test(out)) out = `${out.replace(/\s+$/, "")}\n</project_instructions>`;
	return out.replace(/[ \t]+$/gm, "").replace(/^\s+/, "").replace(/\s+$/, "");
}
function stripChatmlTags(text) {
	return text.replace(/<\|im_start\|>\s*system\s*:\s*/gi, "").replace(/<\/?project_instructions>/gi, "").replace(/<\|im_end\|>/g, "");
}
function stripHarnessPersona(text) {
	return text.replace(/You are an AI agent powered by DeepSeek Harness\.?\s*/g, "").replace(/You are a helpful software engineer assistant\.?\s*/gi, "").replace(/你是一个有帮助的软件工程师助手[。.]?\s*/g, "").replace(/我是 DeepSeek(?:驱动)?的? AI(?:编程)?助手[，,]?[^\n]*/g, "").replace(/You are a coding agent powered by the \{\{model\}\} model, running on the DeepSeek Harness\. Your working directory is \{\{cwd\}\}\.?\s*/g, "Working directory: {{cwd}}. ").replace(/You are a coding agent powered by the \{\{model\}\} model, running on the DeepSeek Harness\.?\s*/g, "").replace(/You are Claude Code, Anthropic's official CLI for Claude\.?\s*/g, "").replace(/[ \t]{2,}/g, " ").replace(/ \n/g, "\n").trim();
}
function adaptInjectForMinimalPreset(text) {
	return text;
}
function modePromptText(text, redteam) {
	if (!redteam) return text.trim();
	const at = text.indexOf(CTF_MARK);
	if (at < 0) return text.trim();
	return text.slice(0, at).replace(/(?:\r?\n[ \t]*[═=\-─━]{6,}[ \t]*)+\s*$/u, "").replace(/\s+$/u, "").trim();
}
function presetLabel(value) {
	if (typeof value === "string") return value.trim();
	if (!value || typeof value !== "object") return "";
	const obj = value;
	if (typeof obj.id === "string" && obj.id.trim()) return obj.id.trim();
	if (typeof obj.name === "string" && obj.name.trim()) return obj.name.trim();
	return "";
}
function eventList(session) {
	if (!session) return [];
	if (typeof session.snapshotEvents === "function") try {
		const events = session.snapshotEvents();
		if (Array.isArray(events)) return events;
	} catch {}
	return Array.isArray(session.events) ? session.events : [];
}
function sessionOf(context) {
	return context?.agent?.session || context?.session || null;
}
function mountedPresetId(context) {
	const ctx = (context?.agent)?.ctx || context?.ctx;
	if (!ctx || typeof ctx.get !== "function") return "";
	try {
		const presets = ctx.get("agentPresets");
		if (presets && typeof presets.composedPreset === "function") return presetLabel(presets.composedPreset(ctx));
	} catch {}
	return "";
}
function sessionAgentPreset(context) {
	const session = sessionOf(context);
	const mounted = mountedPresetId(context);
	if (mounted) return mounted;
	let selected = "";
	for (const event of eventList(session)) {
		if (event?.type !== "agent-preset/selected") continue;
		const name = presetLabel(event.data?.agentPreset || event.data?.preset || event.data?.name);
		if (name) selected = name;
	}
	if (selected) return selected;
	return presetLabel(session?.projectionValues?.agentPreset) || presetLabel(session?.agentPreset) || presetLabel(session?.header?.agentPreset);
}
function isRedteamPresetId(value) {
	const text = presetLabel(value);
	if (!text) return false;
	if (text === "redteam") return true;
	if (/^red[\s_-]*team$/i.test(text)) return true;
	const label = text.replace(/不是红队/g, "").replace(/非红队/g, "");
	return /红队/.test(label);
}
function isRedteamSession(context) {
	return isRedteamPresetId(sessionAgentPreset(context));
}
function isMnemonPluginMessage(message) {
	if (!message || typeof message !== "object") return false;
	const source = message.source;
	if (!source || typeof source !== "object") return false;
	const plugin = String(source.plugin || "").toLowerCase();
	return source.kind === "plugin" && plugin.includes("mnemon");
}
function isMnemonSection(name) {
	return name.toLowerCase().includes("mnemon");
}
function isCwdOnlyText(text) {
	const t = text.trim();
	return t === "Your working directory is {{cwd}}." || t === "Working directory: {{cwd}}." || t === "Working directory: {{cwd}}";
}
function looksLikeOfficialIdentity(text) {
	if (!text.trim()) return true;
	const stripped = stripHarnessPersona(text);
	return !stripped.trim() || isCwdOnlyText(stripped);
}
function overlayOfficialIdentity(sections) {
	const out = [];
	let sawSuffix = false;
	for (const section of sections) {
		const name = String(section.name || "");
		if (name === "harness:identity" || name === "dsh-purge:identity") continue;
		if (PERSONA_PREFIX.has(name) || PERSONA_LEGACY.has(name)) {
			const raw = String(section.text || "");
			out.push(looksLikeOfficialIdentity(raw) ? {
				...section,
				text: ""
			} : section);
			continue;
		}
		if (PERSONA_SUFFIX.has(name)) {
			sawSuffix = true;
			const raw = String(section.text || "");
			if (!raw.trim() || looksLikeOfficialIdentity(raw) || isCwdOnlyText(raw)) out.push({
				...section,
				text: CWD_ONLY_SUFFIX
			});
			else out.push(section);
			continue;
		}
		out.push(section);
	}
	if (!sawSuffix) out.push({
		name: "deployment:persona-suffix",
		text: CWD_ONLY_SUFFIX,
		order: 10200
	});
	return out;
}
function leadWithInject(sections, injectText, protocol) {
	const inject = injectText.trim();
	const withoutDup = sections.filter((s) => {
		if (s.name === "dsh-purge" && inject) return false;
		if (s.name === "dshpg-capabilities" && protocol) return false;
		return true;
	});
	const head = [];
	if (inject) head.push({
		name: "dsh-purge",
		text: inject,
		interpolate: false,
		order: GLOBAL_PROMPT_ORDER
	});
	if (protocol) head.push({
		name: CAPABILITY_SECTION,
		text: protocol,
		interpolate: false,
		order: -99999
	});
	return [...head, ...withoutDup];
}
function insertRoleSection(sections, roleText) {
	const body = roleText.trim();
	if (!body) return sections;
	if (sections.some((s) => s.text.includes(body))) return sections;
	const capAt = sections.findIndex((s) => s.name === CAPABILITY_SECTION);
	const purgeAt = sections.findIndex((s) => s.name === "dsh-purge");
	const at = capAt >= 0 ? capAt + 1 : purgeAt >= 0 ? purgeAt + 1 : 0;
	const next = sections.slice();
	next.splice(at, 0, {
		name: "dshpg-redteam-role",
		text: body,
		interpolate: false,
		order: -99997
	});
	return next;
}
/** Rewrite assembled prompt: drop harness identity, lead with inject, stamp protocol. */
function rewritePromptAssembly(assembled, options) {
	if (!assembled || !Array.isArray(assembled.sections)) return assembled ?? {
		sections: [],
		contexts: [],
		tools: []
	};
	const rest = [];
	for (const section of assembled.sections) {
		if (!section || section.name === "harness:identity" || section.name === "dsh-purge:identity") continue;
		if (options.dropMnemon && isMnemonSection(section.name)) continue;
		const next = { ...section };
		if (typeof next.text === "string" && !isPluginPromptSection(next.name)) next.text = stripChatmlTags(stripHarnessPersona(next.text));
		rest.push(next);
	}
	const redteam = isRedteamSession(options.context);
	const redteamChild = redteam && sessionOf(options.context)?.header?.origin === "subagent";
	const injectText = escapeDshInterpolation(peelChatmlEnvelope(adaptInjectForMinimalPreset(modePromptText(options.fallbackInject, redteam))));
	const protocol = options.capabilityProtocol === false ? "" : capabilityProtocolText({
		redteam,
		redteamChild,
		enabled: true
	});
	let sections = leadWithInject(rest.filter((s) => !isPluginPromptSection(s.name)), injectText, protocol);
	if (redteam) sections = insertRoleSection(sections, options.roleText || "");
	sections = overlayOfficialIdentity(sections);
	return {
		...assembled,
		sections,
		contexts: Array.isArray(assembled.contexts) ? assembled.contexts : [],
		tools: Array.isArray(assembled.tools) ? assembled.tools : []
	};
}
export { CAPABILITY_SECTION, CWD_ONLY_SUFFIX, GLOBAL_PROMPT_ORDER, adaptInjectForMinimalPreset, capabilityProtocolText, escapeDshInterpolation, isMnemonPluginMessage, isPluginPromptSection, isRedteamPresetId, isRedteamSession, modePromptText, overlayOfficialIdentity, peelChatmlEnvelope, rewritePromptAssembly, sessionAgentPreset };
