// src/redteam/tools/bindings.ts
const bindings = /* @__PURE__ */ new Map();
const reservations = /* @__PURE__ */ new Map();
const BINDINGS_CAP = 500;
function capMap(m, cap) {
	const origSet = m.set.bind(m);
	m.set = (k, v) => {
		if (!m.has(k) && m.size >= cap) {
			const first = m.keys().next().value;
			if (first !== void 0) m.delete(first);
		}
		return origSet(k, v);
	};
}
capMap(bindings, BINDINGS_CAP);
function sessionInfoOf(exec) {
	const session = exec?.agent?.session;
	if (!session) return {
		id: void 0,
		parentId: void 0,
		session: void 0
	};
	return {
		id: session.id !== void 0 ? String(session.id) : void 0,
		parentId: session.header?.parentSession !== void 0 && session.header.parentSession !== null ? String(session.header.parentSession) : void 0,
		session
	};
}
function resolveRootSession(session) {
	const chain = [];
	let cur = session;
	let guard = 0;
	while (cur && guard < 64) {
		const info = sessionInfoOf({ agent: { session: cur } });
		if (!info.id) break;
		chain.push(info.id);
		if (!info.parentId) break;
		try {
			cur = cur.store?.get?.(info.parentId);
		} catch {
			return {
				rootId: info.parentId,
				chain: [...chain, info.parentId]
			};
		}
		if (!cur) return {
			rootId: info.parentId,
			chain: [...chain, info.parentId]
		};
		guard += 1;
	}
	return {
		rootId: chain.length ? chain[chain.length - 1] : void 0,
		chain
	};
}
function bindKeysOf(exec) {
	const info = sessionInfoOf(exec);
	if (!info.id) return [];
	const { rootId, chain } = info.session ? resolveRootSession(info.session) : {
		rootId: info.id,
		chain: [info.id]
	};
	const root = rootId || info.id;
	return [...new Set([
		root,
		info.id,
		...chain
	].filter(Boolean))];
}
function bindingViewOf(exec) {
	const info = sessionInfoOf(exec);
	const { rootId, chain } = info.session ? resolveRootSession(info.session) : {
		rootId: info.id,
		chain: info.id ? [info.id] : []
	};
	return {
		session_id: info.id ?? null,
		parent_session: info.parentId ?? null,
		root_session: rootId ?? null,
		session_chain: chain,
		is_subagent: info.parentId !== void 0,
		bound_engagement: rootId ? bindings.get(rootId) ?? null : null
	};
}
function setBinding(exec, engagementId) {
	for (const key of bindKeysOf(exec)) bindings.set(key, engagementId);
}
function resolveEngagement(exec, explicit, listIds) {
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
function reservationList(rootId) {
	const map = reservations.get(rootId);
	if (!map) return [];
	return [...map.entries()].map(([key, at]) => ({
		key,
		at
	}));
}
function addReservation(rootId, key) {
	if (!reservations.has(rootId)) reservations.set(rootId, /* @__PURE__ */ new Map());
	reservations.get(rootId).set(key, Date.now());
}
function dropReservation(rootId, key) {
	reservations.get(rootId)?.delete(key);
}
async function liveRunningChildren(ctx, rootSessionId) {
	const subagents = typeof ctx.get === "function" ? ctx.get("subagents") : void 0;
	if (!subagents?.listChildren) return {
		available: false,
		running: 0,
		error: "subagents 不可用"
	};
	try {
		const entries = await subagents.listChildren(rootSessionId);
		const running = (Array.isArray(entries) ? entries : []).filter((e) => e && typeof e === "object" && e.kind === "child" && e.activity === "running");
		return {
			available: true,
			running: running.length,
			running_labels: running.map((e) => e.label || e.id).slice(0, 20)
		};
	} catch (error) {
		return {
			available: false,
			running: 0,
			error: error instanceof Error ? error.message : String(error)
		};
	}
}
async function agentSlotStatus(ctx, exec, maxAgents = 3) {
	const rootId = bindKeysOf(exec)[0];
	if (!rootId) return {
		ok: false,
		error: "无会话 id"
	};
	const live = await liveRunningChildren(ctx, rootId);
	const reserved = reservationList(rootId).length;
	const running = live.available ? live.running : reserved;
	return {
		root_session: rootId,
		max_agents: maxAgents,
		running,
		reserved,
		slots_free: Math.max(0, maxAgents - running - reserved),
		live
	};
}
function agentSlotAcquire(exec, key, maxAgents = 3) {
	const rootId = bindKeysOf(exec)[0];
	if (!rootId) return {
		ok: false,
		reason: "无会话 id"
	};
	if (reservationList(rootId).length >= maxAgents) return {
		ok: false,
		reason: "并发已满"
	};
	addReservation(rootId, key || `slot-${Date.now()}`);
	return { ok: true };
}
function agentSlotRelease(exec, key) {
	const rootId = bindKeysOf(exec)[0];
	if (rootId) dropReservation(rootId, key);
}
export { agentSlotAcquire, agentSlotRelease, agentSlotStatus, bindKeysOf, bindingViewOf, liveRunningChildren, reservationList, resolveEngagement, setBinding };
