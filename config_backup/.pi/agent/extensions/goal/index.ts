import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";

const CUSTOM_TYPE = "goal";
const TOOL_NAME = "goal_status";
const STATUS_KEY = "goal";
const GOAL_VERSION = 1;

const LIVE_STATES = new Set<GoalStatus>(["active", "paused", "blocked"]);

type GoalStatus = "active" | "paused" | "blocked" | "complete";
type GoalToolAction = "progress" | "complete" | "blocked";

interface GoalState {
	version: typeof GOAL_VERSION;
	id: string;
	status: GoalStatus;
	objective: string;
	createdAt: string;
	updatedAt: string;
	progress?: string;
	nextStep?: string;
	evidence?: string;
	completionSummary?: string;
	blockedReason?: string;
	lastAssessment?: string;
	continuationCount: number;
	missedStatusCount: number;
	lastContinuationAt?: string;
	completedAt?: string;
}

interface GoalEntryData {
	kind: "set" | "pause" | "resume" | "clear" | "continue";
	state?: GoalState;
	previousGoalId?: string;
	createdAt: string;
}

interface GoalToolDetails {
	action: GoalToolAction;
	state?: GoalState;
	message: string;
}

const GoalStatusParams = Type.Object({
	action: StringEnum(["progress", "complete", "blocked"] as const, {
		description:
			"Use progress while work remains, complete only when the goal's stopping condition is satisfied, or blocked when user input/approval is required.",
	}),
	summary: Type.String({ description: "Concise status summary, completion summary, or blocking reason." }),
	nextStep: Type.Optional(Type.String({ description: "The next concrete step if action is progress." })),
	evidence: Type.Optional(Type.String({ description: "Evidence, validation, or artifacts supporting this assessment." })),
	confidence: Type.Optional(Type.Number({ minimum: 0, maximum: 1, description: "0-1 confidence in the assessment." })),
});

type GoalStatusParams = Static<typeof GoalStatusParams>;

function nowIso(): string {
	return new Date().toISOString();
}

function makeGoalId(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneState(state: GoalState): GoalState {
	return {
		...state,
		missedStatusCount: typeof state.missedStatusCount === "number" ? state.missedStatusCount : 0,
	};
}

function isGoalState(value: unknown): value is GoalState {
	if (!value || typeof value !== "object") return false;
	const candidate = value as Partial<GoalState>;
	return (
		candidate.version === GOAL_VERSION &&
		typeof candidate.id === "string" &&
		typeof candidate.objective === "string" &&
		candidate.objective.trim().length > 0 &&
		typeof candidate.continuationCount === "number" &&
		Number.isFinite(candidate.continuationCount) &&
		(typeof candidate.missedStatusCount === "number" ? Number.isFinite(candidate.missedStatusCount) : true) &&
		(candidate.status === "active" ||
			candidate.status === "paused" ||
			candidate.status === "blocked" ||
			candidate.status === "complete")
	);
}

function stateFromCustomData(data: unknown): GoalState | undefined {
	if (!data || typeof data !== "object") return undefined;
	const entry = data as Partial<GoalEntryData>;
	if (entry.kind === "clear") return undefined;
	return isGoalState(entry.state) ? cloneState(entry.state) : undefined;
}

function stateFromToolDetails(details: unknown): GoalState | undefined {
	if (!details || typeof details !== "object") return undefined;
	const entry = details as Partial<GoalToolDetails>;
	return isGoalState(entry.state) ? cloneState(entry.state) : undefined;
}

function applyStateFromBranch(ctx: ExtensionContext): GoalState | undefined {
	let nextState: GoalState | undefined;

	for (const entry of ctx.sessionManager.getBranch()) {
		if (entry.type === "custom" && entry.customType === CUSTOM_TYPE) {
			const data = entry.data as GoalEntryData | undefined;
			if (data?.kind === "clear") {
				nextState = undefined;
				continue;
			}
			const state = stateFromCustomData(data);
			if (state) nextState = state;
			continue;
		}

		if (entry.type !== "message") continue;
		const message = entry.message;
		if (message.role !== "toolResult" || message.toolName !== TOOL_NAME) continue;
		const state = stateFromToolDetails(message.details);
		if (state) nextState = state;
	}

	return nextState;
}

function appendGoalEntry(pi: ExtensionAPI, kind: GoalEntryData["kind"], state: GoalState | undefined, previousGoalId?: string): void {
	pi.appendEntry<GoalEntryData>(CUSTOM_TYPE, {
		kind,
		state: state ? cloneState(state) : undefined,
		previousGoalId,
		createdAt: nowIso(),
	});
}

function firstLine(text: string): string {
	return text.trim().split(/\r?\n/, 1)[0]?.trim() ?? "";
}

function summarizeObjective(objective: string, maxLength = 60): string {
	const line = firstLine(objective).replace(/\s+/g, " ");
	if (line.length <= maxLength) return line;
	return `${line.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function formatGoalStatus(state: GoalState | undefined): string {
	if (!state) return "No /goal is set.";

	const lines = [
		`/goal ${state.status.toUpperCase()}: ${summarizeObjective(state.objective, 90)}`,
		`ID: ${state.id}`,
		`Continuations: ${state.continuationCount}`,
	];

	if (state.progress) lines.push(`Progress: ${state.progress}`);
	if (state.nextStep) lines.push(`Next: ${state.nextStep}`);
	if (state.evidence) lines.push(`Evidence: ${state.evidence}`);
	if (state.blockedReason) lines.push(`Blocked: ${state.blockedReason}`);
	if (state.completionSummary) lines.push(`Complete: ${state.completionSummary}`);
	if (state.lastAssessment) lines.push(`Assessment: ${state.lastAssessment}`);
	if (state.missedStatusCount > 0) lines.push(`Missing status reports: ${state.missedStatusCount}`);
	if (state.lastContinuationAt) lines.push(`Last continuation: ${state.lastContinuationAt}`);
	if (state.completedAt) lines.push(`Completed: ${state.completedAt}`);

	return lines.join("\n");
}

function updateUi(ctx: ExtensionContext, state: GoalState | undefined): void {
	if (!ctx.hasUI) return;

	if (!state) {
		ctx.ui.setStatus(STATUS_KEY, undefined);
		ctx.ui.setWidget(STATUS_KEY, undefined);
		return;
	}

	const label = summarizeObjective(state.objective, 32);
	ctx.ui.setStatus(STATUS_KEY, `goal: ${state.status} ${label}`);

	const widget = [`/goal ${state.status}: ${summarizeObjective(state.objective, 72)}`];
	if (state.progress) widget.push(`progress: ${state.progress}`);
	if (state.nextStep) widget.push(`next: ${state.nextStep}`);
	if (state.blockedReason) widget.push(`blocked: ${state.blockedReason}`);
	ctx.ui.setWidget(STATUS_KEY, widget, { placement: "belowEditor" });
}

function buildGoalSystemPrompt(state: GoalState): string {
	const statusLines = [
		`Objective:\n${state.objective.trim()}`,
		`Status: ${state.status}`,
		`Continuation count: ${state.continuationCount}`,
	];
	if (state.progress) statusLines.push(`Current progress: ${state.progress}`);
	if (state.nextStep) statusLines.push(`Next step: ${state.nextStep}`);
	if (state.evidence) statusLines.push(`Evidence so far: ${state.evidence}`);

	return `\n\n## Active /goal workflow\n${statusLines.join("\n")}\n\nTreat this as a durable, thread-level objective. Work autonomously toward the objective across turns until it is complete, blocked, paused, or cleared. Decompose the goal into concrete steps, use available tools when useful, and keep scope bounded to the objective and the user's latest instruction.\n\nYou have access to the ${TOOL_NAME} tool for goal self-assessment. While this goal is active, call ${TOOL_NAME} exactly once before ending each assistant turn:\n- action=\"progress\" when useful work remains; include what changed and the next concrete step.\n- action=\"complete\" only when the objective's stopping condition is satisfied with evidence.\n- action=\"blocked\" when you need user input/approval or cannot safely continue; ask the user a focused question.\n\nDo not claim the goal is complete unless you have called ${TOOL_NAME} with action=\"complete\". If the user's latest message conflicts with this goal, follow the user message and mark the goal blocked if continuation should stop.`;
}

function buildKickoffPrompt(state: GoalState): string {
	return `Start working on this /goal. Follow the active /goal workflow instructions and use ${TOOL_NAME} before ending the turn.\n\n${state.objective.trim()}${buildGoalSystemPrompt(state)}`;
}

function buildContinuationPrompt(state: GoalState): string {
	const lines = [
		`Continue working autonomously on the active /goal.`,
		`Objective: ${summarizeObjective(state.objective, 140)}`,
	];
	if (state.nextStep) lines.push(`Next step: ${state.nextStep}`);
	if (state.progress) lines.push(`Progress so far: ${state.progress}`);
	if (state.missedStatusCount > 0) {
		lines.push(`Important: the previous assistant turn did not call ${TOOL_NAME}. Call ${TOOL_NAME} in this turn or the goal will pause.`);
	}
	lines.push(`Call ${TOOL_NAME} with progress, complete, or blocked before ending this turn.`);
	return `${lines.join("\n")}${buildGoalSystemPrompt(state)}`;
}

function buildTemplate(): string {
	return `/goal set Objective:\n- What should be true when this goal is done?\n\nNon-goals:\n- What should the agent avoid doing?\n\nConstraints:\n- Important rules, files, APIs, or preferences.\n\nValidation:\n- Commands, checks, or evidence the agent should use.\n\nStopping condition:\n- The exact condition that lets the model call ${TOOL_NAME} with action=\"complete\".\n\nNotes:\n- Any extra context.`;
}

function textFromContent(content: string | Array<{ type: string; text?: string }>): string {
	if (typeof content === "string") return content;
	return content.flatMap((part) => (part.type === "text" && part.text ? [part.text] : [])).join("\n");
}

function notifyOrLog(ctx: ExtensionContext, message: string, type: "info" | "warning" | "error" = "info"): void {
	if (ctx.hasUI) {
		ctx.ui.notify(message, type);
		return;
	}
	console.log(message);
}

function getAssistantStopReason(message: unknown): string | undefined {
	if (!message || typeof message !== "object") return undefined;
	const candidate = message as { role?: string; stopReason?: string };
	return candidate.role === "assistant" ? candidate.stopReason : undefined;
}

export default function goalExtension(pi: ExtensionAPI) {
	let currentGoal: GoalState | undefined;
	let goalStatusCalledThisRun = false;

	const reconstruct = (ctx: ExtensionContext) => {
		currentGoal = applyStateFromBranch(ctx);
		if (currentGoal?.status === "active") ensureGoalToolActive();
		updateUi(ctx, currentGoal);
	};

	const persistAndUpdate = (
		ctx: ExtensionContext,
		kind: GoalEntryData["kind"],
		state: GoalState | undefined,
		previousGoalId?: string,
	) => {
		currentGoal = state ? cloneState(state) : undefined;
		appendGoalEntry(pi, kind, currentGoal, previousGoalId);
		updateUi(ctx, currentGoal);
	};

	const pauseCurrentGoal = (ctx: ExtensionContext, reason: string) => {
		if (!currentGoal) return;
		const paused: GoalState = {
			...currentGoal,
			status: "paused",
			updatedAt: nowIso(),
			lastAssessment: reason,
		};
		persistAndUpdate(ctx, "pause", paused);
		notifyOrLog(ctx, `/goal paused: ${reason}`, "warning");
	};

	const ensureGoalToolActive = (): boolean => {
		if (!pi.getAllTools().some((tool) => tool.name === TOOL_NAME)) return false;
		const activeTools = pi.getActiveTools();
		if (activeTools.includes(TOOL_NAME)) return true;

		try {
			pi.setActiveTools([...activeTools, TOOL_NAME]);
		} catch {
			return false;
		}

		return pi.getActiveTools().includes(TOOL_NAME);
	};

	const queueContinuation = (ctx: ExtensionContext, reason: "kickoff" | "resume" | "continue") => {
		if (!currentGoal || currentGoal.status !== "active") return;
		if (ctx.hasPendingMessages()) return;

		if (!ensureGoalToolActive()) {
			pauseCurrentGoal(ctx, `${TOOL_NAME} is not available or active, so the model cannot self-assess completion.`);
			return;
		}

		const currentCount = Number.isFinite(currentGoal.continuationCount) ? currentGoal.continuationCount : 0;
		const timestamp = nowIso();
		const nextState: GoalState = {
			...currentGoal,
			updatedAt: timestamp,
			lastContinuationAt: timestamp,
			continuationCount: currentCount + (reason === "kickoff" ? 0 : 1),
		};
		persistAndUpdate(ctx, reason === "resume" ? "resume" : "continue", nextState);

		const message = reason === "kickoff" ? buildKickoffPrompt(nextState) : buildContinuationPrompt(nextState);
		goalStatusCalledThisRun = false;
		pi.sendMessage(
			{
				customType: CUSTOM_TYPE,
				content: message,
				display: true,
				details: { reason, goalId: nextState.id, continuationCount: nextState.continuationCount },
			},
			{ triggerTurn: true, deliverAs: "followUp" },
		);
	};

	pi.on("session_start", (_event, ctx) => {
		reconstruct(ctx);
	});

	pi.on("session_tree", (_event, ctx) => {
		reconstruct(ctx);
	});

	pi.on("agent_start", () => {
		goalStatusCalledThisRun = false;
	});

	pi.on("before_agent_start", (event, ctx) => {
		goalStatusCalledThisRun = false;
		if (!currentGoal) reconstruct(ctx);
		if (!currentGoal || currentGoal.status !== "active") return;

		if (!ensureGoalToolActive()) {
			pauseCurrentGoal(ctx, `${TOOL_NAME} is not available or active, so the model cannot self-assess completion.`);
			return;
		}

		return {
			systemPrompt: event.systemPrompt + buildGoalSystemPrompt(currentGoal),
		};
	});

	pi.on("turn_end", (event, ctx) => {
		if (!currentGoal) reconstruct(ctx);
		if (!currentGoal || currentGoal.status !== "active") return;

		const stopReason = getAssistantStopReason(event.message);
		if (stopReason === "toolUse") return;
		if (stopReason && stopReason !== "stop") {
			pauseCurrentGoal(ctx, `last assistant turn ended with stopReason=${stopReason}.`);
			return;
		}

		if (!goalStatusCalledThisRun) {
			const missedStatusCount = currentGoal.missedStatusCount ?? 0;
			if (missedStatusCount >= 1) {
				pauseCurrentGoal(ctx, `assistant ended twice without calling ${TOOL_NAME}.`);
				return;
			}

			const warned: GoalState = {
				...currentGoal,
				updatedAt: nowIso(),
				missedStatusCount: missedStatusCount + 1,
				lastAssessment: `Assistant ended without calling ${TOOL_NAME}; retrying once.`,
			};
			persistAndUpdate(ctx, "continue", warned);
		}

		queueContinuation(ctx, "continue");
	});

	pi.registerTool<typeof GoalStatusParams, GoalToolDetails>({
		name: TOOL_NAME,
		label: "Goal Status",
		description:
			"Report progress, completion, or blocking status for the active /goal workflow. Use this before ending each turn while a /goal is active.",
		promptSnippet: "Report progress, completion, or blocked state for the active /goal workflow",
		promptGuidelines: [
			`Use ${TOOL_NAME} exactly once before ending each turn while an active /goal workflow is present.`,
			`Use ${TOOL_NAME} with action=\"complete\" only when the active /goal objective is actually satisfied with evidence.`,
		],
		parameters: GoalStatusParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			goalStatusCalledThisRun = true;
			if (!currentGoal) {
				return {
					content: [{ type: "text", text: "No active /goal is set." }],
					details: { action: params.action, message: "No active /goal is set." },
				};
			}

			if (currentGoal.status !== "active") {
				const message = `/goal is ${currentGoal.status}; no autonomous status update was recorded.`;
				return {
					content: [{ type: "text", text: message }],
					details: { action: params.action, state: cloneState(currentGoal), message },
				};
			}

			const timestamp = nowIso();
			let updated: GoalState;
			let message: string;

			switch (params.action) {
				case "complete":
					updated = {
						...currentGoal,
						status: "complete",
						updatedAt: timestamp,
						missedStatusCount: 0,
						completedAt: timestamp,
						completionSummary: params.summary,
						evidence: params.evidence,
						lastAssessment: `complete${params.confidence === undefined ? "" : ` (${params.confidence})`}: ${params.summary}`,
					};
					message = "Goal marked complete. Autonomous continuation stopped.";
					break;
				case "blocked":
					updated = {
						...currentGoal,
						status: "blocked",
						updatedAt: timestamp,
						missedStatusCount: 0,
						blockedReason: params.summary,
						evidence: params.evidence,
						lastAssessment: `blocked${params.confidence === undefined ? "" : ` (${params.confidence})`}: ${params.summary}`,
					};
					message = "Goal marked blocked. Autonomous continuation paused until /goal resume.";
					break;
				case "progress":
				default:
					updated = {
						...currentGoal,
						status: "active",
						updatedAt: timestamp,
						missedStatusCount: 0,
						progress: params.summary,
						nextStep: params.nextStep,
						evidence: params.evidence,
						lastAssessment: `progress${params.confidence === undefined ? "" : ` (${params.confidence})`}: ${params.summary}`,
					};
					message = "Goal progress recorded. Continue until complete or blocked.";
					break;
			}

			currentGoal = updated;
			updateUi(ctx, currentGoal);
			return {
				content: [{ type: "text", text: message }],
				details: { action: params.action, state: cloneState(updated), message },
				terminate: params.action === "complete" || params.action === "blocked",
			};
		},
		renderCall(args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold(`${TOOL_NAME} `)) + theme.fg("muted", args.action ?? ""), 0, 0);
		},
		renderResult(result, _options, theme) {
			const details = result.details as GoalToolDetails | undefined;
			if (!details) return new Text(textFromContent(result.content as any), 0, 0);
			const state = details.state;
			if (state?.status === "complete") return new Text(theme.fg("success", details.message), 0, 0);
			if (state?.status === "blocked") return new Text(theme.fg("warning", details.message), 0, 0);
			return new Text(theme.fg("muted", details.message), 0, 0);
		},

	});

	pi.registerMessageRenderer(CUSTOM_TYPE, (message, _options, theme) => {
		const details = message.details as { reason?: string; continuationCount?: number } | undefined;
		const reason = details?.reason;
		if (reason === "kickoff" || reason === "resume" || reason === "continue") {
			const count = details?.continuationCount ?? 0;
			return new Text(theme.fg("accent", `/goal ${reason}`) + theme.fg("dim", ` #${count}`), 0, 0);
		}
		return new Text(theme.fg("accent", "/goal") + " " + theme.fg("muted", textFromContent(message.content as any)), 0, 0);
	});

	pi.registerCommand("goal", {
		description: "Set, inspect, pause/resume, clear, or scaffold an autonomous /goal workflow",
		getArgumentCompletions: (prefix) => {
			const commands = ["status", "pause", "resume", "clear", "template", "set"];
			const items = commands
				.filter((command) => command.startsWith(prefix.trim()))
				.map((command) => ({ value: command, label: command }));
			return items.length > 0 ? items : null;
		},
		handler: async (args, ctx) => {
			if (!currentGoal) reconstruct(ctx);

			const raw = args.trim();
			const [firstToken = ""] = raw.split(/\s+/);
			const subcommand = firstToken.toLowerCase();
			const restText = raw.slice(firstToken.length).trimStart();

			if (!raw || subcommand === "status") {
				notifyOrLog(ctx, formatGoalStatus(currentGoal), currentGoal ? "info" : "warning");
				return;
			}

			if (subcommand === "template") {
				if (ctx.hasUI) {
					ctx.ui.setEditorText(buildTemplate());
					ctx.ui.notify("Inserted /goal template into the editor.", "info");
				} else {
					console.log(buildTemplate());
				}
				return;
			}

			if (subcommand === "clear") {
				const previousGoalId = currentGoal?.id;
				persistAndUpdate(ctx, "clear", undefined, previousGoalId);
				if (!ctx.isIdle()) ctx.abort();
				notifyOrLog(ctx, "/goal cleared.", "info");
				return;
			}

			if (subcommand === "pause") {
				if (!currentGoal) {
					notifyOrLog(ctx, "No /goal is set.", "warning");
					return;
				}
				const paused: GoalState = {
					...currentGoal,
					status: "paused",
					updatedAt: nowIso(),
					lastAssessment: restText || "Paused by user.",
				};
				persistAndUpdate(ctx, "pause", paused);
				if (!ctx.isIdle()) ctx.abort();
				notifyOrLog(ctx, "/goal paused. Use /goal resume to continue.", "info");
				return;
			}

			if (subcommand === "resume") {
				if (!currentGoal) {
					notifyOrLog(ctx, "No /goal is set.", "warning");
					return;
				}
				const resumed: GoalState = {
					...currentGoal,
					status: "active",
					updatedAt: nowIso(),
					missedStatusCount: 0,
					blockedReason: undefined,
					lastAssessment: restText || "Resumed by user.",
				};
				persistAndUpdate(ctx, "resume", resumed);
				notifyOrLog(ctx, "/goal resumed.", "info");
				if (ctx.isIdle()) queueContinuation(ctx, "resume");
				return;
			}

			const objective = subcommand === "set" ? restText : raw;
			if (!ctx.isIdle()) {
				notifyOrLog(ctx, "Wait for the current agent turn to finish, or run /goal pause, before setting a new /goal.", "warning");
				return;
			}
			if (!objective.trim()) {
				notifyOrLog(ctx, "Usage: /goal <objective> or /goal set <objective>", "warning");
				return;
			}

			if (currentGoal && LIVE_STATES.has(currentGoal.status)) {
				if (!ctx.hasUI) {
					notifyOrLog(ctx, "An active /goal already exists. Run /goal clear first, then set the new goal.", "warning");
					return;
				}
				const ok = await ctx.ui.confirm(
					"Replace active /goal?",
					`Current: ${summarizeObjective(currentGoal.objective, 100)}\n\nNew: ${summarizeObjective(objective, 100)}`,
				);
				if (!ok) {
					ctx.ui.notify("/goal replacement cancelled.", "info");
					return;
				}
			}

			const timestamp = nowIso();
			const newGoal: GoalState = {
				version: GOAL_VERSION,
				id: makeGoalId(),
				status: "active",
				objective: objective.trim(),
				createdAt: timestamp,
				updatedAt: timestamp,
				continuationCount: 0,
				missedStatusCount: 0,
			};
			const previousGoalId = currentGoal?.id;
			persistAndUpdate(ctx, "set", newGoal, previousGoalId);
			notifyOrLog(ctx, `/goal set: ${summarizeObjective(newGoal.objective, 80)}`, "info");
			if (ctx.isIdle()) queueContinuation(ctx, "kickoff");
		},
	});
}
