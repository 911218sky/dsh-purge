import {
  useCallback,
  useEffect,
  useState,
  createElement,
  Fragment,
  type ChangeEvent,
  type ReactElement,
} from "react";
import type { InjectStatus, PurgeContext } from "../types.js";

export const name = "dsh-purge";
export const inject = ["slots", "locale"] as const;

const NS = "settings.dsh-purge";

const zh = {
  title: "dsh-purge",
  dock: "dsh-purge",
  open: "打开",
  close: "关闭",
  save: "保存提示词",
  refresh: "刷新",
  hint: "Web-only · Cordis 运行时注入 · 无宿主磁盘补丁",
  saved: "已保存。新开一轮对话后注入生效。",
} as const;

const en = {
  title: "dsh-purge",
  dock: "dsh-purge",
  open: "Open",
  close: "Close",
  save: "Save prompt",
  refresh: "Refresh",
  hint: "Web-only · Cordis runtime inject · no host disk patches",
  saved: "Saved. Start a new turn for injection to apply.",
} as const;

type DictKey = keyof typeof zh;
type Translate = (key: DictKey) => string;

interface PromptResponse extends InjectStatus {
  ok?: boolean;
  text?: string;
}

interface StatusResponse extends InjectStatus {
  ok?: boolean;
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const raw = await res.text();
  let body: unknown = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { raw };
  }
  if (!res.ok) {
    const err =
      typeof body === "object" && body && "error" in body
        ? String((body as { error?: unknown }).error || res.status)
        : `HTTP ${res.status}`;
    throw new Error(err);
  }
  return body as T;
}

function Panel({ t }: { t: Translate }): ReactElement {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const refresh = useCallback(async () => {
    setBusy(true);
    setMsg("");
    try {
      const st = await apiJson<StatusResponse>("/dsh-purge/status");
      setStatus(st);
      const prompt = await apiJson<PromptResponse>("/dsh-purge/prompt");
      setText(String(prompt.text || ""));
    } catch (error: unknown) {
      setMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(async () => {
    setBusy(true);
    setMsg("");
    try {
      await apiJson("/dsh-purge/prompt", {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setMsg(t("saved"));
      await refresh();
    } catch (error: unknown) {
      setMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [text, refresh, t]);

  const onChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    setText(event.target.value);
  };

  return createElement(
    "div",
    {
      style: {
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
        zIndex: 9999,
      },
    },
    createElement("div", { style: { fontWeight: 600, fontSize: 15 } }, t("title")),
    createElement("div", { style: { fontSize: 12, opacity: 0.75 } }, t("hint")),
    status
      ? createElement(
          "div",
          { style: { fontSize: 11, opacity: 0.85, lineHeight: 1.45 } },
          createElement("div", null, `${status.mode || "?"} · v${status.version || "?"}`),
          createElement("div", null, status.dsh_home || ""),
          createElement(
            "div",
            null,
            `${status.override_status || "?"} · ${status.override_bytes ?? 0} bytes`,
          ),
        )
      : null,
    createElement("textarea", {
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
        borderRadius: 6,
      },
      spellCheck: false,
    }),
    createElement(
      "div",
      { style: { display: "flex", gap: 8, alignItems: "center" } },
      createElement(
        "button",
        { type: "button", disabled: busy, onClick: () => void save() },
        t("save"),
      ),
      createElement(
        "button",
        { type: "button", disabled: busy, onClick: () => void refresh() },
        t("refresh"),
      ),
      msg ? createElement("span", { style: { fontSize: 11 } }, msg) : null,
    ),
  );
}

function Dock({ t }: { t: Translate }): ReactElement {
  const [open, setOpen] = useState(false);
  return createElement(
    Fragment,
    null,
    createElement(
      "button",
      {
        type: "button",
        onClick: () => setOpen((v) => !v),
        style: {
          position: "fixed",
          top: 12,
          right: 12,
          zIndex: 10000,
          padding: "6px 10px",
          borderRadius: 8,
          border: "1px solid var(--dsh-border, #444)",
          background: "var(--dsh-bg, #1a1a1a)",
          color: "var(--dsh-fg, #eee)",
          cursor: "pointer",
          fontSize: 12,
        },
        title: t("dock"),
      },
      open ? t("close") : t("dock"),
    ),
    open ? createElement(Panel, { t }) : null,
  );
}

export function apply(ctx: PurgeContext): void {
  try {
    ctx.effect?.(() => {
      ctx.locale?.register(NS, { zh: { ...zh }, en: { ...en } });
    }, "dsh-purge: dictionaries");
  } catch {
    /* ignore */
  }

  const bound = ctx.locale?.bind?.(NS);
  const t: Translate = (key) => {
    if (bound) {
      const hit = bound(key);
      if (hit && hit !== key) return hit;
    }
    return zh[key];
  };

  try {
    ctx.slots?.inject("shell.overlay", () =>
      ctx.slots?.register(
        {
          name: "shell.overlay",
          id: "dsh-purge-dock",
          order: 50,
        },
        () => createElement(Dock, { t }),
      ),
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn("[dsh-purge client]", msg);
  }
}

export default { name, inject, apply };
