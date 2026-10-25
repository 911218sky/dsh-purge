import {
  GLOBAL_PROMPT_ORDER,
  adaptInjectForMinimalPreset,
  escapeDshInterpolation,
  isMnemonPluginMessage,
  isRedteamSession,
  modePromptText,
  peelChatmlEnvelope,
  rewritePromptAssembly,
} from "./identity.js";
import { CAPABILITY_SECTION, capabilityProtocolText } from "./capability.js";
import { type ResolvedConfig, mergeConfig } from "./config.js";
import { findDshHome } from "./home.js";
import { injectStatus, readInjectText, seedPromptInject } from "./inject-store.js";
import { installWebRoutes } from "./web/routes.js";
import { installSubagentRoleCapture, resolveSubagentRoleText } from "./redteam/role-section.js";
import type {
  AssembleContext,
  PromptAssembly,
  PromptSectionInput,
  PurgeConfig,
  PurgeContext,
  SessionLike,
  WorkingDirectoryService,
} from "./types.js";

export const name = "dsh-purge";
export const inject = ["systemPrompt", "tools"] as const;

function log(config: ResolvedConfig, ...args: unknown[]): void {
  if (config.verbose) console.log("[dsh-purge]", ...args);
}

function resolvePromptCwd(context: AssembleContext): string {
  try {
    const session = context.agent?.session;
    if (session) {
      try {
        const cordis = context.agent?.ctx;
        const wd =
          (typeof cordis?.get === "function"
            ? (cordis.get("workingDirectory") as WorkingDirectoryService | undefined)
            : undefined) ||
          (cordis?.workingDirectory as WorkingDirectoryService | undefined);
        if (wd && typeof wd.get === "function") {
          const live = wd.get(session);
          if (typeof live === "string" && live.trim()) return live.trim();
        }
      } catch {
        /* workingDirectory may be outside inject */
      }
      const header = String(session.header?.cwd || "").trim();
      if (header) return header;
    }
  } catch {
    /* ignore */
  }
  try {
    return process.cwd();
  } catch {
    return "";
  }
}

function addPromptSection(ctx: PurgeContext, section: PromptSectionInput): void {
  const hosts: PurgeContext[] = [];
  const push = (host: PurgeContext | undefined): void => {
    if (host && !hosts.includes(host)) hosts.push(host);
  };
  try {
    push(ctx.systemPrompt?.ctx);
  } catch {
    /* proxy without inject */
  }
  push(ctx);

  const disposers: Array<() => void> = [];
  let registered = false;
  let lastError: unknown = null;

  for (const host of hosts) {
    try {
      const prompt = host.systemPrompt;
      if (!prompt) continue;
      const d = prompt.section(section);
      registered = true;
      if (typeof d === "function") disposers.push(d);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("already registered")) registered = true;
      else lastError = error;
    }
  }
  if (!registered && lastError) throw lastError;

  if (disposers.length && typeof ctx.effect === "function") {
    try {
      ctx.effect(() => () => {
        for (const d of disposers) {
          try {
            d();
          } catch {
            /* ignore */
          }
        }
      });
    } catch {
      /* dead ctx */
    }
  }
}

function registerCwdVariable(ctx: PurgeContext): void {
  const hosts: PurgeContext[] = [];
  const push = (host: PurgeContext | undefined): void => {
    if (host && !hosts.includes(host)) hosts.push(host);
  };
  try {
    push(ctx.systemPrompt?.ctx);
  } catch {
    /* ignore */
  }
  push(ctx);

  const disposers: Array<() => void> = [];
  for (const host of hosts) {
    try {
      const prompt = host.systemPrompt;
      if (!prompt || typeof prompt.variable !== "function") continue;
      const d = prompt.variable("cwd", (context) => resolvePromptCwd(context) || undefined);
      if (typeof d === "function") disposers.push(d);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.includes("already registered")) {
        console.warn("[dsh-purge] register cwd variable:", msg);
      }
    }
  }
  if (disposers.length && typeof ctx.effect === "function") {
    try {
      ctx.effect(() => () => {
        for (const d of disposers) {
          try {
            d();
          } catch {
            /* ignore */
          }
        }
      });
    } catch {
      /* ignore */
    }
  }
}

function readInjectFallback(context: AssembleContext): string {
  const text = readInjectText(findDshHome());
  if (!text) return "";
  return modePromptText(text, isRedteamSession(context));
}

export function registerPromptSections(ctx: PurgeContext, config: ResolvedConfig): void {
  registerCwdVariable(ctx);
  addPromptSection(ctx, {
    name: "dsh-purge",
    order: GLOBAL_PROMPT_ORDER,
    interpolate: false,
    text: (context) => {
      if (!config.enabled) return "";
      return escapeDshInterpolation(
        peelChatmlEnvelope(adaptInjectForMinimalPreset(readInjectFallback(context))),
      );
    },
  });

  if (config.capabilityProtocol) {
    addPromptSection(ctx, {
      name: CAPABILITY_SECTION,
      order: GLOBAL_PROMPT_ORDER + 1,
      interpolate: false,
      text: (context) => {
        if (!config.enabled) return "";
        const redteam = isRedteamSession(context);
        const session = context.agent?.session as SessionLike | undefined;
        return capabilityProtocolText({
          redteam,
          redteamChild: Boolean(redteam && session?.header?.origin === "subagent"),
          enabled: true,
        });
      },
    });
  }

  const postPrompt = config.postPrompt.trim();
  if (!postPrompt) return;
  if (!Number.isFinite(config.postPromptOrder) || config.postPromptOrder <= GLOBAL_PROMPT_ORDER) {
    console.warn(
      `[dsh-purge] postPromptOrder (${config.postPromptOrder}) must be > ${GLOBAL_PROMPT_ORDER}; skipping`,
    );
    return;
  }
  addPromptSection(ctx, {
    name: "dsh-purge:post",
    order: config.postPromptOrder,
    text: () => (config.enabled ? postPrompt : ""),
  });
}

function rewriteLiveAssembly(
  config: ResolvedConfig,
  assembled: PromptAssembly,
  context: AssembleContext,
): PromptAssembly {
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
    roleText,
  });
  const variables = { ...(rewritten.variables || assembled.variables || {}) };
  if (cwd) variables.cwd = cwd;
  return { ...rewritten, variables };
}

function installAssembleWaterfall(ctx: PurgeContext, config: ResolvedConfig): void {
  if (typeof ctx.on !== "function") return;
  const handler = async (
    _assembly: unknown,
    context: unknown,
    next: unknown,
  ): Promise<unknown> => {
    const runNext = next as () => Promise<PromptAssembly>;
    const assembled = await runNext();
    if (!config.enabled) return assembled;
    try {
      return rewriteLiveAssembly(config, assembled, context as AssembleContext);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn("[dsh-purge] assemble rewrite failed:", msg);
      return assembled;
    }
  };

  try {
    const dispose = ctx.on("system-prompt/assemble", handler, { global: true });
    if (typeof dispose === "function" && typeof ctx.effect === "function") {
      ctx.effect(() => () => {
        try {
          dispose();
        } catch {
          /* ignore */
        }
      });
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn("[dsh-purge] assemble waterfall:", msg);
  }
}

function installMnemonMessageStrip(ctx: PurgeContext, config: ResolvedConfig): void {
  if (typeof ctx.on !== "function") return;
  const strip = config.stripMnemon;
  const wrap = async (_payload: unknown, next: unknown): Promise<unknown> => {
    const runNext = next as () => Promise<{ messages?: unknown[] } | null | undefined>;
    const decision = await runNext();
    if (!decision) return decision;
    const incoming = Array.isArray(decision.messages) ? decision.messages : [];
    const messages = strip ? incoming.filter((m) => !isMnemonPluginMessage(m)) : incoming;
    if (messages.length === incoming.length && Array.isArray(decision.messages)) return decision;
    return { ...decision, messages };
  };

  try {
    const dispose = ctx.on("agent/pre-step", wrap, { global: true, prepend: true });
    if (typeof dispose === "function" && typeof ctx.effect === "function") {
      ctx.effect(() => () => {
        try {
          dispose();
        } catch {
          /* ignore */
        }
      });
    }
  } catch {
    /* optional hook */
  }
}

function installStatusTool(ctx: PurgeContext): void {
  if (!ctx.tools?.register) return;
  try {
    ctx.tools.register({
      name: "purge_status",
      description:
        "Show dsh-purge runtime status (Cordis inject, prompt-inject.md; no host disk patches).",
      parameters: { type: "object", additionalProperties: false, properties: {} },
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: { text: { type: "string" } },
        },
        render: (_args, value) => [{ type: "text", text: String(value?.text ?? "") }],
      },
      async execute() {
        const st = injectStatus(findDshHome());
        return {
          text: [
            "dsh-purge 2.x (web / cordis-runtime)",
            `DSH_HOME: ${st.dsh_home}`,
            `inject: ${st.override_path} (${st.override_status}, ${st.override_bytes} bytes)`,
            "host patches: removed — runtime systemPrompt only",
          ].join("\n"),
        };
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn("[dsh-purge] tools.register:", msg);
  }
}

export function apply(ctx: PurgeContext, config: PurgeConfig = {}): void {
  const cfg = mergeConfig(config);
  if (!cfg.enabled) {
    log(cfg, "disabled");
    return;
  }

  try {
    const seed = seedPromptInject(findDshHome());
    log(cfg, "seed prompt-inject:", seed.action, seed.path);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn("[dsh-purge] seed prompt-inject:", msg);
  }

  registerPromptSections(ctx, cfg);
  installAssembleWaterfall(ctx, cfg);
  installMnemonMessageStrip(ctx, cfg);
  try {
    installSubagentRoleCapture(ctx);
  } catch {
    /* optional */
  }
  installStatusTool(ctx);
  installWebRoutes(ctx, cfg);
  log(cfg, "ready (web cordis-runtime)");
}

const plugin = { name, inject, apply };
export default plugin;
