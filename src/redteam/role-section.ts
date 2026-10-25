import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { isRedteamSession } from "../identity.js";
import type {
  AssembleContext,
  CordisListener,
  PurgeContext,
  SessionLike,
} from "../types.js";

const ROLE_TAG =
  /^[ \t]*redteamRole:[ \t]*(recon|assess|vuln-scan|exploit|internal)[ \t]*$/im;
const roleBySession = new Map<string, string>();
const ROLE_SESSION_CAP = 400;

function redteamRoot(): string {
  return process.env.DSH_HOME
    ? join(process.env.DSH_HOME, "redteam")
    : join(homedir(), ".dsh", "redteam");
}

export function parseRedteamRole(text: string): string {
  const matched = text.match(ROLE_TAG);
  return matched ? matched[1].toLowerCase() : "";
}

function textOfMessage(message: unknown): string {
  if (!message) return "";
  if (typeof message === "string") return message;
  if (typeof message !== "object") return "";
  const record = message as { content?: unknown; text?: unknown };
  const content = record.content ?? record.text;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (typeof block === "object" && block && "text" in block) {
        return String((block as { text?: unknown }).text ?? "");
      }
      return "";
    })
    .join("\n");
}

function remember(sessionId: string | undefined, role: string): void {
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

function isRedteamChild(
  session: SessionLike | null | undefined,
  context: AssembleContext,
): boolean {
  const header = session?.header;
  if (header?.origin !== "subagent" && !((header?.delegationDepth ?? 0) > 0)) {
    return false;
  }
  return isRedteamSession({ ...context, session: session ?? undefined });
}

export function resolveSubagentRoleText(context: AssembleContext): string {
  const session = context.agent?.session || context.session;
  if (!session || !isRedteamChild(session, context)) return "";
  const id = session.id ? String(session.id) : "";
  const role = (id && roleBySession.get(id)) || "";
  if (!role) return "";
  const fp = join(redteamRoot(), "engagements", "_shared", "agents", `${role}.md`);
  if (!existsSync(fp)) return "";
  try {
    return readFileSync(fp, "utf8").trim();
  } catch {
    return "";
  }
}

export function installSubagentRoleCapture(ctx: PurgeContext): void {
  if (typeof ctx.on !== "function") return;

  const onClaim: CordisListener = (payload, next) => {
    const body = payload as {
      agent?: { session?: SessionLike; id?: string };
      message?: unknown;
    };
    const agent = body?.agent;
    const session = agent?.session;
    if (session && isRedteamChild(session, { agent, session })) {
      const role = parseRedteamRole(textOfMessage(body.message));
      if (role) {
        remember(session.id, role);
        if (agent?.id) remember(String(agent.id), role);
      }
    }
    return typeof next === "function" ? (next as () => unknown)() : undefined;
  };

  try {
    const dispose = ctx.on("agent/claim", onClaim, { global: true });
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
    /* optional */
  }
}
