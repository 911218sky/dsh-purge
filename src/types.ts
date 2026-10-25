import type { IncomingMessage, ServerResponse } from "node:http";

/** Plugin config from cordis.patch.yml. */
export interface PurgeConfig {
  enabled?: boolean;
  stripMnemon?: boolean;
  verbose?: boolean;
  postPrompt?: string;
  postPromptOrder?: number;
  capabilityProtocol?: boolean;
}

export interface AssembledSection {
  name: string;
  text: string;
  order?: number;
  interpolate?: boolean;
}

export interface AssembledContext {
  name: string;
  text: string;
  interpolate?: boolean;
  required?: boolean;
}

export interface PromptAssembly {
  sections: AssembledSection[];
  contexts: AssembledContext[];
  tools: unknown[];
  variables?: Record<string, string | undefined>;
}

/** Per-turn assemble context from dsh-system-prompt (partial). */
export interface AssembleContext {
  scope?: unknown;
  signal?: AbortSignal;
  agent?: {
    session?: SessionLike;
    ctx?: CordisLike;
    id?: string;
  };
  session?: SessionLike;
  ctx?: CordisLike;
}

export interface SessionHeader {
  cwd?: string;
  origin?: string;
  parentSession?: string;
  delegationDepth?: number;
  agentPreset?: string | { id?: string; name?: string };
}

export interface SessionLike {
  id?: string;
  header?: SessionHeader;
  agentPreset?: string | { id?: string; name?: string };
  projectionValues?: { agentPreset?: string | { id?: string; name?: string } };
  events?: SessionEvent[];
  snapshotEvents?: () => SessionEvent[];
}

export interface SessionEvent {
  type?: string;
  data?: Record<string, unknown>;
}

export interface CordisLike {
  get?: (name: string) => unknown;
  workingDirectory?: WorkingDirectoryService;
  [key: string]: unknown;
}

export interface WorkingDirectoryService {
  get: (session: SessionLike) => string | undefined;
}

export interface PromptSectionInput {
  name: string;
  order: number;
  interpolate?: boolean;
  text: string | ((context: AssembleContext) => string);
  complete?: boolean;
}

export interface SystemPromptService {
  section: (section: PromptSectionInput) => (() => void) | void;
  variable: (
    name: string,
    provider: (context: AssembleContext) => string | undefined,
  ) => (() => void) | void;
  ctx?: PurgeContext;
}

export interface ToolsService {
  register: (tool: ToolDefinition) => void;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  output: {
    schema: Record<string, unknown>;
    render: (args: unknown, value: { text?: string }) => Array<{ type: string; text: string }>;
  };
  execute: () => Promise<{ text: string }> | { text: string };
}

export interface LocaleService {
  register: (ns: string, dicts: Record<string, Record<string, string>>) => void;
  bind: (ns: string) => (key: string) => string;
}

export interface SlotsService {
  inject: (name: string, factory: () => unknown) => void;
  register: (
    meta: { name: string; id: string; order?: number },
    component: unknown,
  ) => unknown;
}

export interface WebServerService {
  register: (spec: {
    method: string;
    path: string;
    handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;
  }) => void;
}

export type CordisListener = (...args: unknown[]) => unknown;

export interface PurgeContext {
  systemPrompt?: SystemPromptService;
  tools?: ToolsService;
  locale?: LocaleService;
  slots?: SlotsService;
  on?: (
    event: string,
    listener: CordisListener,
    options?: { global?: boolean; prepend?: boolean },
  ) => (() => void) | void;
  effect?: (factory: () => void | (() => void), label?: string) => void;
  inject?: (deps: string[], callback: (host: PurgeContext) => void) => void;
  get?: (name: string) => unknown;
}

export type HttpRequest = IncomingMessage;
export type HttpResponse = ServerResponse;

export interface RewriteOptions {
  fallbackInject: string;
  dropMnemon: boolean;
  capabilityProtocol: boolean;
  context?: AssembleContext;
  roleText?: string;
  dropWorkspaceBaseline?: boolean;
}

export interface InjectStatus {
  dsh_home: string;
  override_path: string;
  override_bytes: number;
  override_status: "ready" | "empty";
  surface: "web";
  mode: "cordis-runtime";
  version: string;
}

export interface PromptSaveBody {
  text?: string;
}
