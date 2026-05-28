import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type LaneMode = "normal" | "fast";

type LaneState = {
	mode: LaneMode;
};

const CUSTOM_TYPE = "openai-fast-lane-state";
const STATUS_KEY = "openai-fast-lane";

export default function openAIFastLane(pi: ExtensionAPI) {
	let mode: LaneMode = "normal";

	function isOpenAIProvider(provider: string | undefined): boolean {
		return provider === "openai" || provider === "openai-codex";
	}

	function getStatusText(ctx: Pick<ExtensionContext, "model">): string {
		const label = mode === "fast" ? "FAST" : "normal";
		const inactive = isOpenAIProvider(ctx.model?.provider) ? "" : " (inactive)";
		return `OpenAI lane: ${label}${inactive}`;
	}

	function updateStatus(ctx: Pick<ExtensionContext, "model" | "ui">): void {
		ctx.ui.setStatus(STATUS_KEY, getStatusText(ctx));
	}

	function restoreModeFromBranch(ctx: ExtensionContext): void {
		mode = "normal";

		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "custom" || entry.customType !== CUSTOM_TYPE) continue;

			const data = entry.data as Partial<LaneState> | undefined;
			if (data?.mode === "normal" || data?.mode === "fast") {
				mode = data.mode;
			}
		}
	}

	function persistMode(): void {
		pi.appendEntry<LaneState>(CUSTOM_TYPE, { mode });
	}

	function setMode(nextMode: LaneMode, ctx: ExtensionContext, persist = true): void {
		mode = nextMode;
		if (persist) persistMode();
		updateStatus(ctx);
	}

	function notifyMode(ctx: ExtensionContext): void {
		const appliesNow = isOpenAIProvider(ctx.model?.provider);
		const message =
			mode === "fast"
				? `OpenAI fast lane enabled${appliesNow ? "" : " (will apply when using an OpenAI model)"}`
				: "OpenAI fast lane disabled; using normal service tier";

		ctx.ui.notify(message, appliesNow || mode === "normal" ? "info" : "warning");
	}

	function sendOptionalPrompt(args: string, ctx: ExtensionContext): void {
		const prompt = args.trim();
		if (!prompt) return;

		if (ctx.isIdle()) {
			pi.sendUserMessage(prompt);
		} else {
			pi.sendUserMessage(prompt, { deliverAs: "steer" });
		}
	}

	pi.on("session_start", (_event, ctx) => {
		restoreModeFromBranch(ctx);
		updateStatus(ctx);
	});

	pi.on("session_tree", (_event, ctx) => {
		restoreModeFromBranch(ctx);
		updateStatus(ctx);
	});

	pi.on("model_select", (_event, ctx) => {
		updateStatus(ctx);
	});

	pi.registerCommand("fast", {
		description: "Enable OpenAI fast lane (service_tier=priority); optional args are sent as a prompt",
		handler: (args, ctx) => {
			setMode("fast", ctx);
			notifyMode(ctx);
			sendOptionalPrompt(args, ctx);
		},
	});

	pi.registerCommand("normal", {
		description: "Disable OpenAI fast lane and use the normal service tier; optional args are sent as a prompt",
		handler: (args, ctx) => {
			setMode("normal", ctx);
			notifyMode(ctx);
			sendOptionalPrompt(args, ctx);
		},
	});

	pi.on("before_provider_request", (event, ctx) => {
		if (mode !== "fast") return;
		if (!isOpenAIProvider(ctx.model?.provider)) return;
		if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) return;

		return {
			...(event.payload as Record<string, unknown>),
			service_tier: "priority",
		};
	});
}
