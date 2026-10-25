import { appendJsonl, compactAsset, dataFile, engagementDirById, listEngagements, openEngagement, readJsonl, stats, updateJsonlById, upsertAsset } from "../file-store.js";
import { agentSlotAcquire, agentSlotRelease, agentSlotStatus, bindingViewOf, resolveEngagement, setBinding } from "./bindings.js";
import { runPreflight } from "./preflight.js";
import fs from "node:fs";
import path from "node:path";
// src/redteam/tools/index.ts
/**
* Slim redteam tools — file-based JSONL evidence store (no SQLite).
*/
const name = "dsh-purge-redteam-tools";
const inject = ["tools"];
const MAX_AGENTS = 3;
function text(value) {
	return [{
		type: "text",
		text: typeof value === "string" ? value : JSON.stringify(value, null, 2)
	}];
}
function resolveEng(exec, explicit) {
	const list = listEngagements().map((e) => e.id);
	return resolveEngagement(exec, explicit, () => list);
}
function registerTool(ctx, spec) {
	if (!ctx.tools?.register) return;
	ctx.tools.register({
		name: spec.name,
		description: spec.description,
		parameters: spec.parameters,
		output: {
			schema: {
				type: "object",
				additionalProperties: true,
				properties: { text: { type: "string" } }
			},
			render: (_args, value) => text(value?.text ?? value)
		},
		async execute(args, exec) {
			try {
				const result = await spec.execute(args, exec);
				return typeof result === "object" && result !== null && "text" in result ? result : { text: typeof result === "string" ? result : JSON.stringify(result, null, 2) };
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				return { text: JSON.stringify({
					ok: false,
					error: msg
				}, null, 2) };
			}
		}
	});
}
function buildTools(ctx) {
	return [
		{
			name: "redteam_engagement_open",
			description: "打开或创建攻防演练靶标并绑定当前会话（子智能体继承）。",
			parameters: {
				type: "object",
				additionalProperties: false,
				properties: {
					target: {
						type: "string",
						description: "靶标单位名称"
					},
					scope: {
						type: "array",
						items: { type: "string" },
						description: "授权 CIDR（可选）"
					}
				},
				required: ["target"]
			},
			execute(args, exec) {
				const meta = openEngagement(String(args.target), args.scope);
				setBinding(exec, meta.id);
				return {
					ok: true,
					engagement: meta,
					stats: stats(meta.id),
					session: bindingViewOf(exec)
				};
			}
		},
		{
			name: "redteam_session_bind",
			description: "绑定已有靶标到当前会话。省略 engagement 则列出候选。",
			parameters: {
				type: "object",
				additionalProperties: false,
				properties: { engagement: { type: "string" } }
			},
			execute(args, exec) {
				const id = args.engagement ? String(args.engagement) : "";
				if (!id) return {
					engagements: listEngagements(),
					session: bindingViewOf(exec)
				};
				const dir = engagementDirById(id);
				const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
				setBinding(exec, meta.id);
				return {
					ok: true,
					engagement: meta,
					session: bindingViewOf(exec)
				};
			}
		},
		{
			name: "redteam_session_info",
			description: "查看当前会话的靶标绑定与父子关系。",
			parameters: {
				type: "object",
				additionalProperties: false,
				properties: {}
			},
			execute(_args, exec) {
				return {
					session: bindingViewOf(exec),
					engagements: listEngagements().map((e) => ({
						id: e.id,
						target: e.target,
						slug: e.slug
					}))
				};
			}
		},
		{
			name: "redteam_preflight",
			description: "开工前自检：FOFA/VPS/技能目录/onboarding 状态（v2 JSONL 模式）。",
			parameters: {
				type: "object",
				additionalProperties: false,
				properties: { include: {
					type: "string",
					description: "逗号分隔技能名，省略=全部"
				} }
			},
			execute(args) {
				return runPreflight(typeof args.include === "string" ? args.include : void 0);
			}
		},
		{
			name: "redteam_agent_slot",
			description: "并发闸门：同一靶标最多 3 个执行智能体。action=status|acquire|release",
			parameters: {
				type: "object",
				additionalProperties: false,
				properties: {
					action: {
						type: "string",
						enum: [
							"status",
							"acquire",
							"release"
						]
					},
					key: {
						type: "string",
						description: "acquire/release 时的占位 key"
					}
				},
				required: ["action"]
			},
			async execute(args, exec) {
				const action = String(args.action || "status");
				if (action === "status") return agentSlotStatus(ctx, exec, MAX_AGENTS);
				if (action === "acquire") return agentSlotAcquire(exec, String(args.key || `slot-${Date.now()}`), MAX_AGENTS);
				if (action === "release") {
					agentSlotRelease(exec, String(args.key || ""));
					return { ok: true };
				}
				return {
					ok: false,
					error: "unknown action"
				};
			}
		},
		{
			name: "redteam_asset_add",
			description: "登记资产（JSONL upsert）。",
			parameters: {
				type: "object",
				additionalProperties: true,
				properties: { engagement: { type: "string" } }
			},
			execute(args, exec) {
				const eid = resolveEng(exec, args.engagement ? String(args.engagement) : void 0);
				const row = upsertAsset(eid, {
					...args,
					engagement: eid
				});
				return {
					ok: true,
					asset: compactAsset(row)
				};
			}
		},
		{
			name: "redteam_asset_upsert",
			description: "同 redteam_asset_add（别名）。",
			parameters: {
				type: "object",
				additionalProperties: true,
				properties: {}
			},
			execute(args, exec) {
				const eid = resolveEng(exec, args.engagement ? String(args.engagement) : void 0);
				const row = upsertAsset(eid, {
					...args,
					engagement: eid
				});
				return {
					ok: true,
					asset: compactAsset(row)
				};
			}
		},
		{
			name: "redteam_asset_link",
			description: "登记资产关联边（JSONL）。",
			parameters: {
				type: "object",
				additionalProperties: true,
				properties: {}
			},
			execute(args, exec) {
				const eid = resolveEng(exec, args.engagement ? String(args.engagement) : void 0);
				return {
					ok: true,
					link: appendJsonl(dataFile(eid, "links"), {
						...args,
						engagement: eid
					})
				};
			}
		},
		{
			name: "redteam_asset_query",
			description: "查询资产（compact 列表）。",
			parameters: {
				type: "object",
				additionalProperties: false,
				properties: {
					engagement: { type: "string" },
					limit: { type: "number" },
					ip: { type: "string" },
					state: { type: "string" }
				}
			},
			execute(args, exec) {
				const eid = resolveEng(exec, args.engagement ? String(args.engagement) : void 0);
				let rows = readJsonl(dataFile(eid, "assets"));
				if (args.ip) rows = rows.filter((r) => r.ip === args.ip || r.target === args.ip);
				if (args.state) rows = rows.filter((r) => r.state === args.state);
				const limit = Number(args.limit) || 50;
				return {
					count: rows.length,
					assets: rows.slice(0, limit).map(compactAsset)
				};
			}
		},
		{
			name: "redteam_asset_stats",
			description: "靶标库统计。",
			parameters: {
				type: "object",
				additionalProperties: false,
				properties: { engagement: { type: "string" } }
			},
			execute(args, exec) {
				const eid = resolveEng(exec, args.engagement ? String(args.engagement) : void 0);
				return stats(eid);
			}
		},
		{
			name: "redteam_asset_test",
			description: "回写资产测试状态（追加 test 字段）。",
			parameters: {
				type: "object",
				additionalProperties: true,
				properties: { id: { type: "string" } }
			},
			execute(args, exec) {
				const eid = resolveEng(exec, args.engagement ? String(args.engagement) : void 0);
				const fp = dataFile(eid, "assets");
				const id = String(args.id || "");
				const hit = updateJsonlById(fp, id, {
					test_status: args.status || args.test_status,
					test: args.test,
					surface: args.surface,
					blocked: args.blocked
				});
				if (!hit) return {
					ok: false,
					error: "asset not found"
				};
				return {
					ok: true,
					asset: compactAsset(hit)
				};
			}
		},
		{
			name: "redteam_vuln_add",
			description: "登记漏洞（JSONL append）。",
			parameters: {
				type: "object",
				additionalProperties: true,
				properties: {}
			},
			execute(args, exec) {
				const eid = resolveEng(exec, args.engagement ? String(args.engagement) : void 0);
				return {
					ok: true,
					vuln: appendJsonl(dataFile(eid, "vulns"), {
						...args,
						engagement: eid,
						status: args.status || "candidate"
					})
				};
			}
		},
		{
			name: "redteam_vuln_query",
			description: "查询漏洞。",
			parameters: {
				type: "object",
				additionalProperties: false,
				properties: {
					engagement: { type: "string" },
					status: { type: "string" },
					limit: { type: "number" }
				}
			},
			execute(args, exec) {
				const eid = resolveEng(exec, args.engagement ? String(args.engagement) : void 0);
				let rows = readJsonl(dataFile(eid, "vulns"));
				if (args.status) rows = rows.filter((r) => r.status === args.status);
				const limit = Number(args.limit) || 50;
				return {
					count: rows.length,
					vulns: rows.slice(-limit)
				};
			}
		},
		{
			name: "redteam_vuln_update",
			description: "按 id 更新漏洞状态/证据。",
			parameters: {
				type: "object",
				additionalProperties: true,
				properties: { id: { type: "string" } },
				required: ["id"]
			},
			execute(args, exec) {
				const eid = resolveEng(exec, args.engagement ? String(args.engagement) : void 0);
				const hit = updateJsonlById(dataFile(eid, "vulns"), String(args.id), args);
				if (!hit) return {
					ok: false,
					error: "vuln not found"
				};
				return {
					ok: true,
					vuln: hit
				};
			}
		},
		{
			name: "redteam_chain_add",
			description: "追加攻击链步骤（stage_code/tool/result）。",
			parameters: {
				type: "object",
				additionalProperties: true,
				properties: {
					stage_code: { type: "string" },
					tool: { type: "string" },
					result: { type: "string" }
				}
			},
			execute(args, exec) {
				const eid = resolveEng(exec, args.engagement ? String(args.engagement) : void 0);
				return {
					ok: true,
					step: appendJsonl(dataFile(eid, "chain"), {
						...args,
						engagement: eid
					})
				};
			}
		},
		{
			name: "redteam_chain",
			description: "读取攻击链步骤。",
			parameters: {
				type: "object",
				additionalProperties: false,
				properties: {
					engagement: { type: "string" },
					limit: { type: "number" }
				}
			},
			execute(args, exec) {
				const eid = resolveEng(exec, args.engagement ? String(args.engagement) : void 0);
				const rows = readJsonl(dataFile(eid, "chain"));
				const limit = Number(args.limit) || 100;
				return {
					count: rows.length,
					chain: rows.slice(-limit)
				};
			}
		},
		{
			name: "redteam_attack_chain",
			description: "同 redteam_chain（别名）。",
			parameters: {
				type: "object",
				additionalProperties: false,
				properties: { engagement: { type: "string" } }
			},
			execute(args, exec) {
				const eid = resolveEng(exec, args.engagement ? String(args.engagement) : void 0);
				return { chain: readJsonl(dataFile(eid, "chain")) };
			}
		},
		{
			name: "redteam_access_add",
			description: "登记入口/隧道/WebShell 会话。",
			parameters: {
				type: "object",
				additionalProperties: true,
				properties: {}
			},
			execute(args, exec) {
				const eid = resolveEng(exec, args.engagement ? String(args.engagement) : void 0);
				return {
					ok: true,
					session: appendJsonl(dataFile(eid, "sessions"), {
						...args,
						engagement: eid
					})
				};
			}
		},
		{
			name: "redteam_access_list",
			description: "列出入口/隧道/WebShell。",
			parameters: {
				type: "object",
				additionalProperties: false,
				properties: { engagement: { type: "string" } }
			},
			execute(args, exec) {
				const eid = resolveEng(exec, args.engagement ? String(args.engagement) : void 0);
				return { sessions: readJsonl(dataFile(eid, "sessions")) };
			}
		},
		{
			name: "redteam_sessions",
			description: "同 redteam_access_list（别名）。",
			parameters: {
				type: "object",
				additionalProperties: false,
				properties: { engagement: { type: "string" } }
			},
			execute(args, exec) {
				const eid = resolveEng(exec, args.engagement ? String(args.engagement) : void 0);
				return { sessions: readJsonl(dataFile(eid, "sessions")) };
			}
		},
		{
			name: "redteam_credential_list",
			description: "列出凭据（JSONL）。",
			parameters: {
				type: "object",
				additionalProperties: false,
				properties: { engagement: { type: "string" } }
			},
			execute(args, exec) {
				const eid = resolveEng(exec, args.engagement ? String(args.engagement) : void 0);
				return { credentials: readJsonl(dataFile(eid, "credentials")) };
			}
		},
		{
			name: "redteam_http_evidence_add",
			description: "追加 HTTP 证据摘要。",
			parameters: {
				type: "object",
				additionalProperties: true,
				properties: {}
			},
			execute(args, exec) {
				const eid = resolveEng(exec, args.engagement ? String(args.engagement) : void 0);
				return {
					ok: true,
					evidence: appendJsonl(dataFile(eid, "evidence"), {
						...args,
						engagement: eid,
						kind: "http"
					})
				};
			}
		},
		{
			name: "redteam_score_list",
			description: "得分列表（v2 占位：从 chain/sessions 推导摘要，无自动计分）。",
			parameters: {
				type: "object",
				additionalProperties: false,
				properties: { engagement: { type: "string" } }
			},
			execute(args, exec) {
				const eid = resolveEng(exec, args.engagement ? String(args.engagement) : void 0);
				return {
					mode: "file-store-v2",
					note: "v2 无 SQLite 计分板；用 chain/sessions/vulns 数量作进度摘要",
					stats: stats(eid),
					points: [],
					total_score: 0
				};
			}
		}
	];
}
function apply(ctx) {
	if (!ctx.tools?.register) {
		console.warn("[dsh-purge/redteam/tools] tools registry unavailable");
		return;
	}
	let count = 0;
	for (const spec of buildTools(ctx)) try {
		registerTool(ctx, spec);
		count += 1;
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		if (!msg.includes("already registered")) console.warn(`[dsh-purge/redteam/tools] ${spec.name}:`, msg);
	}
	try {
		console.log(`[dsh-purge/redteam/tools] registered ${count} tools (jsonl file-store)`);
	} catch {}
}
var tools_default = {
	name,
	inject,
	apply
};
export { apply, tools_default as default, inject, name };
