import type { PurgeContext } from "../../types.js";

const bindings = new Map<string, string>();
const reservations = new Map<string, Map<string, number>>();
const BINDINGS_CAP = 500;

function capMap(m: Map<string, unknown>, cap: number): void {
  const origSet = m.set.bind(m);
  m.set = (k: string, v: unknown) => {
    if (!m.has(k) && m.size >= cap) {
      const first = m.keys().next().value;
      if (first !== undefined) m.delete(first);
    }
    return origSet(k, v);
  };
}
capMap(bindings as Map<string, unknown>, BINDINGS_CAP);

export interface ExecContext {
  agent?: { session?: SessionExec; id?: string };
}

interface SessionExec {
  id?: string;
  header?: { parentSession?: string };
  store?: { get?: (id: string) => SessionExec | undefined };
}

function sessionInfoOf(exec: ExecContext | undefined) {
  const session = exec?.agent?.session;
  if (!session) return { id: undefined as string | undefined, parentId: undefined as string | undefined, session: undefined };
  const id = session.id !== undefined ? String(session.id) : undefined;
  const parentId =
    session.header?.parentSession !== undefined && session.header.parentSession !== null
      ? String(session.header.parentSession)
      : undefined;
  return { id, parentId, session };
}

function resolveRootSession(session: SessionExec): { rootId: string | undefined; chain: string[] } {
  const chain: string[] = [];
  let cur: SessionExec | undefined = session;
  let guard = 0;
  while (cur && guard < 64) {
    const info = sessionInfoOf({ agent: { session: cur } });
    if (!info.id) break;
    chain.push(info.id);
    if (!info.parentId) break;
    try {
      cur = cur.store?.get?.(info.parentId);
    } catch {
      return { rootId: info.parentId, chain: [...chain, info.parentId] };
    }
    if (!cur) return { rootId: info.parentId, chain: [...chain, info.parentId] };
    guard += 1;
  }
  return { rootId: chain.length ? chain[chain.length - 1] : undefined, chain };
}

export function bindKeysOf(exec: ExecContext | undefined): string[] {
  const info = sessionInfoOf(exec);
  if (!info.id) return [];
  const { rootId, chain } = info.session ? resolveRootSession(info.session) : { rootId: info.id, chain: [info.id] };
  const root = rootId || info.id;
  return [...new Set([root, info.id, ...chain].filter(Boolean))];
}

export function bindingViewOf(exec: ExecContext | undefined) {
  const info = sessionInfoOf(exec);
  const { rootId, chain } = info.session ? resolveRootSession(info.session) : { rootId: info.id, chain: info.id ? [info.id] : [] };
  return {
    session_id: info.id ?? null,
    parent_session: info.parentId ?? null,
    root_session: rootId ?? null,
    session_chain: chain,
    is_subagent: info.parentId !== undefined,
    bound_engagement: rootId ? bindings.get(rootId) ?? null : null,
  };
}

export function setBinding(exec: ExecContext | undefined, engagementId: string): void {
  for (const key of bindKeysOf(exec)) bindings.set(key, engagementId);
}

export function resolveEngagement(
  exec: ExecContext | undefined,
  explicit: string | undefined,
  listIds: () => string[],
): string {
  if (explicit?.trim()) return explicit.trim();
  for (const key of bindKeysOf(exec)) {
    const bound = bindings.get(key);
    if (bound) return bound;
  }
  const list = listIds();
  if (list.length === 1) {
    setBinding(exec, list[0]);
    return list[0];
  }
  throw new Error("尚未绑定靶标：请先调用 redteam_engagement_open 传入靶标单位名称");
}

export function reservationList(rootId: string) {
  const map = reservations.get(rootId);
  if (!map) return [];
  return [...map.entries()].map(([key, at]) => ({ key, at }));
}

function addReservation(rootId: string, key: string): void {
  if (!reservations.has(rootId)) reservations.set(rootId, new Map());
  reservations.get(rootId)!.set(key, Date.now());
}

function dropReservation(rootId: string, key: string): void {
  reservations.get(rootId)?.delete(key);
}

export async function liveRunningChildren(ctx: PurgeContext, rootSessionId: string) {
  const subagents = typeof ctx.get === "function" ? (ctx.get("subagents") as { listChildren?: (id: string) => Promise<unknown[]> } | undefined) : undefined;
  if (!subagents?.listChildren) {
    return { available: false, running: 0, error: "subagents 不可用" };
  }
  try {
    const entries = await subagents.listChildren(rootSessionId);
    const rows = Array.isArray(entries) ? entries : [];
    const running = rows.filter(
      (e) => e && typeof e === "object" && (e as { kind?: string; activity?: string }).kind === "child" && (e as { activity?: string }).activity === "running",
    );
    return {
      available: true,
      running: running.length,
      running_labels: running.map((e) => (e as { label?: string; id?: string }).label || (e as { id?: string }).id).slice(0, 20),
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return { available: false, running: 0, error: msg };
  }
}

export async function agentSlotStatus(ctx: PurgeContext, exec: ExecContext | undefined, maxAgents = 3) {
  const keys = bindKeysOf(exec);
  const rootId = keys[0];
  if (!rootId) return { ok: false, error: "无会话 id" };
  const live = await liveRunningChildren(ctx, rootId);
  const reserved = reservationList(rootId).length;
  const running = live.available ? live.running : reserved;
  return {
    root_session: rootId,
    max_agents: maxAgents,
    running,
    reserved,
    slots_free: Math.max(0, maxAgents - running - reserved),
    live,
  };
}

export function agentSlotAcquire(exec: ExecContext | undefined, key: string, maxAgents = 3): { ok: boolean; reason?: string } {
  const keys = bindKeysOf(exec);
  const rootId = keys[0];
  if (!rootId) return { ok: false, reason: "无会话 id" };
  const reserved = reservationList(rootId).length;
  if (reserved >= maxAgents) return { ok: false, reason: "并发已满" };
  addReservation(rootId, key || `slot-${Date.now()}`);
  return { ok: true };
}

export function agentSlotRelease(exec: ExecContext | undefined, key: string): void {
  const keys = bindKeysOf(exec);
  const rootId = keys[0];
  if (rootId) dropReservation(rootId, key);
}
