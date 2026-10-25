// src/config.ts
const DEFAULTS = {
	enabled: true,
	stripMnemon: true,
	verbose: false,
	postPrompt: "",
	postPromptOrder: 5100,
	capabilityProtocol: true
};
function mergeConfig(config) {
	return {
		...DEFAULTS,
		...config
	};
}
export { DEFAULTS, mergeConfig };
