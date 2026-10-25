window.__ModuleLoader__.load({
	id: "dsh-purge",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperties(exports, {
			__esModule: { value: true },
			[Symbol.toStringTag]: { value: "Module" }
		});
		let react = require("react");
		// src/client/index.tsx
		const name = "dsh-purge";
		const inject = ["slots", "locale"];
		const NS = "settings.dsh-purge";
		const zh = {
			title: "dsh-purge",
			dock: "dsh-purge",
			open: "打开",
			close: "关闭",
			save: "保存提示词",
			refresh: "刷新",
			hint: "Web-only · Cordis 运行时注入 · 无宿主磁盘补丁",
			saved: "已保存。新开一轮对话后注入生效。"
		};
		const en = {
			title: "dsh-purge",
			dock: "dsh-purge",
			open: "Open",
			close: "Close",
			save: "Save prompt",
			refresh: "Refresh",
			hint: "Web-only · Cordis runtime inject · no host disk patches",
			saved: "Saved. Start a new turn for injection to apply."
		};
		async function apiJson(path, init) {
			const res = await fetch(path, {
				credentials: "same-origin",
				headers: {
					"content-type": "application/json",
					...init?.headers || {}
				},
				...init
			});
			const raw = await res.text();
			let body = {};
			try {
				body = raw ? JSON.parse(raw) : {};
			} catch {
				body = { raw };
			}
			if (!res.ok) {
				const err = typeof body === "object" && body && "error" in body ? String(body.error || res.status) : `HTTP ${res.status}`;
				throw new Error(err);
			}
			return body;
		}
		function Panel({ t }) {
			const [status, setStatus] = (0, react.useState)(null);
			const [text, setText] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const [msg, setMsg] = (0, react.useState)("");
			const refresh = (0, react.useCallback)(async () => {
				setBusy(true);
				setMsg("");
				try {
					const st = await apiJson("/dsh-purge/status");
					setStatus(st);
					const prompt = await apiJson("/dsh-purge/prompt");
					setText(String(prompt.text || ""));
				} catch (error) {
					setMsg(error instanceof Error ? error.message : String(error));
				} finally {
					setBusy(false);
				}
			}, []);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			const save = (0, react.useCallback)(async () => {
				setBusy(true);
				setMsg("");
				try {
					await apiJson("/dsh-purge/prompt", {
						method: "POST",
						body: JSON.stringify({ text })
					});
					setMsg(t("saved"));
					await refresh();
				} catch (error) {
					setMsg(error instanceof Error ? error.message : String(error));
				} finally {
					setBusy(false);
				}
			}, [
				text,
				refresh,
				t
			]);
			const onChange = (event) => {
				setText(event.target.value);
			};
			return (0, react.createElement)("div", { style: {
				position: "fixed",
				top: 56,
				right: 16,
				width: 420,
				maxWidth: "calc(100vw - 32px)",
				maxHeight: "calc(100vh - 80px)",
				display: "flex",
				flexDirection: "column",
				gap: 10,
				padding: 14,
				background: "var(--dsh-bg, #111)",
				color: "var(--dsh-fg, #eee)",
				border: "1px solid var(--dsh-border, #333)",
				borderRadius: 10,
				boxShadow: "0 8px 32px rgba(0,0,0,.35)",
				zIndex: 9999
			} }, (0, react.createElement)("div", { style: {
				fontWeight: 600,
				fontSize: 15
			} }, t("title")), (0, react.createElement)("div", { style: {
				fontSize: 12,
				opacity: .75
			} }, t("hint")), status ? (0, react.createElement)("div", { style: {
				fontSize: 11,
				opacity: .85,
				lineHeight: 1.45
			} }, (0, react.createElement)("div", null, `${status.mode || "?"} · v${status.version || "?"}`), (0, react.createElement)("div", null, status.dsh_home || ""), (0, react.createElement)("div", null, `${status.override_status || "?"} · ${status.override_bytes ?? 0} bytes`)) : null, (0, react.createElement)("textarea", {
				value: text,
				onChange,
				style: {
					flex: 1,
					minHeight: 220,
					fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
					fontSize: 12,
					padding: 10,
					resize: "vertical",
					background: "transparent",
					color: "inherit",
					border: "1px solid var(--dsh-border, #333)",
					borderRadius: 6
				},
				spellCheck: false
			}), (0, react.createElement)("div", { style: {
				display: "flex",
				gap: 8,
				alignItems: "center"
			} }, (0, react.createElement)("button", {
				type: "button",
				disabled: busy,
				onClick: () => void save()
			}, t("save")), (0, react.createElement)("button", {
				type: "button",
				disabled: busy,
				onClick: () => void refresh()
			}, t("refresh")), msg ? (0, react.createElement)("span", { style: { fontSize: 11 } }, msg) : null));
		}
		function Dock({ t }) {
			const [open, setOpen] = (0, react.useState)(false);
			return (0, react.createElement)(react.Fragment, null, (0, react.createElement)("button", {
				type: "button",
				onClick: () => setOpen((v) => !v),
				style: {
					position: "fixed",
					top: 12,
					right: 12,
					zIndex: 1e4,
					padding: "6px 10px",
					borderRadius: 8,
					border: "1px solid var(--dsh-border, #444)",
					background: "var(--dsh-bg, #1a1a1a)",
					color: "var(--dsh-fg, #eee)",
					cursor: "pointer",
					fontSize: 12
				},
				title: t("dock")
			}, open ? t("close") : t("dock")), open ? (0, react.createElement)(Panel, { t }) : null);
		}
		function apply(ctx) {
			try {
				ctx.effect?.(() => {
					ctx.locale?.register(NS, {
						zh: { ...zh },
						en: { ...en }
					});
				}, "dsh-purge: dictionaries");
			} catch {}
			const bound = ctx.locale?.bind?.(NS);
			const t = (key) => {
				if (bound) {
					const hit = bound(key);
					if (hit && hit !== key) return hit;
				}
				return zh[key];
			};
			try {
				ctx.slots?.inject("shell.overlay", () => ctx.slots?.register({
					name: "shell.overlay",
					id: "dsh-purge-dock",
					order: 50
				}, () => (0, react.createElement)(Dock, { t })));
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				console.warn("[dsh-purge client]", msg);
			}
		}
		var client_default = {
			name,
			inject,
			apply
		};
		exports.apply = apply;
		exports.default = client_default;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map