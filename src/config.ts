import type { PurgeConfig } from "./types.js";

export type { PurgeConfig };

export const DEFAULTS = {
  enabled: true,
  stripMnemon: true,
  verbose: false,
  postPrompt: "",
  postPromptOrder: 5100,
  capabilityProtocol: true,
} as const satisfies Required<PurgeConfig>;

export type ResolvedConfig = Required<PurgeConfig>;

export function mergeConfig(config?: PurgeConfig): ResolvedConfig {
  return { ...DEFAULTS, ...config };
}
