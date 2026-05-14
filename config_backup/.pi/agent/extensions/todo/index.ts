import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { withFileMutationQueue } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";
import { exportTodoMarkdown, parseTodoMarkdown } from "./markdown.js";
import { TodoPanel } from "./panel.js";
import {
	formatPlainForLlm,
	formatToolDetails,
	formatWidgetLines,
	makeTodoView,
	summaryPlain,
	type TodoToolRenderDetails,
} from "./render.js";
import {
	applyTodoEvent,
	createEmptyState,
	hasOpenTodos,
	hasTodos,
	nowIso,
	summarizeState,
	TODO_CUSTOM_TYPE,
	TODO_TOOL_NAME,
	type ApplyResult,
	type PhaseInput,
	type TodoEntryData,
	type TodoEvent,
	type TodoState,
} from "./state.js";

const STATUS_KEY = "todo";
const WIDGET_KEY = "todo-progress";

const TODO_ACTIONS = [
	"init",
	"append_phase",
	"append_tasks",
	"start",
	"done",
	"drop",
	"block",
	"note",
	"list",
	"clear",
	"import_markdown",
	"export_markdown",
	"set_sync_path",
] as const;

const TODO_VIEWS = ["compact", "expanded", "active", "remaining"] as const;

const ToolPhaseInput = Type.Object({
	title: Type.String({ description: "Phase title" }),
	tasks: Type.Optional(Type.Array(Type.String({ description: "Task text" }), { description: "Ordered tasks in this phase" })),
});

const TodoWriteParams = Type.Object({
	action: StringEnum(TODO_ACTIONS, { description: "Todo operation to perform" }),
	title: Type.Optional(Type.String({ description: "Todo list title, for init" })),
	phases: Type.Optional(Type.Array(ToolPhaseInput, { description: "Phases for init" })),
	markdown: Type.Optional(Type.String({ description: "Markdown todo document for import/init" })),
	path: Type.Optional(Type.String({ description: "Path for Markdown import/export/sync. Must resolve inside the current working directory." })),
	replace: Type.Optional(Type.Boolean({ description: "Replace current todos when importing Markdown. Defaults to true." })),
	phaseId: Type.Optional(Type.String({ description: "Phase ID, for append_tasks" })),
	phaseTitle: Type.Optional(Type.String({ description: "Phase title, for append_tasks" })),
	tasks: Type.Optional(Type.Array(Type.String({ description: "Task text" }), { description: "Tasks to append" })),
	taskId: Type.Optional(Type.String({ description: "Task ID for start/done/drop/block/note" })),
	note: Type.Optional(Type.String({ description: "Note for done/note" })),
	reason: Type.Optional(Type.String({ description: "Reason for drop/block" })),
	view: Type.Optional(StringEnum(TODO_VIEWS, { description: "List view verbosity" })),
});

type TodoWriteParams = Static<typeof TodoWriteParams>;

export default function todoExtension(pi: ExtensionAPI): void {
	let currentState: TodoState | undefined;
	let todoToolCalledThisRun = false;
	let queue: Promise<void> = Promise.resolve();

	const enqueue = async <T>(fn: () => Promise<T>): Promise<T> => {
		const run = queue.then(fn, fn);
		queue = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	};

	const appendTodoEvent = (event: TodoEvent) => {
		pi.appendEntry<TodoEntryData>(TODO_CUSTOM_TYPE, {
			kind: "event",
			event,
			createdAt: nowIso(),
		});
	};

	const reconstruct = (ctx: ExtensionContext) => {
		let next: TodoState | undefined;
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "custom" || entry.customType !== TODO_CUSTOM_TYPE) continue;
			const data = entry.data as TodoEntryData | undefined;
			if (data?.kind !== "event" || !data.event) continue;
			const result = applyTodoEvent(next, data.event);
			if (!result.error) next = result.state;
		}
		currentState = next;
		updateUi(ctx);
	};

	const updateUi = (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;
		if (!hasTodos(currentState) || currentState.widgetVisible === false) {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			ctx.ui.setWidget(WIDGET_KEY, undefined);
			return;
		}

		const summary = summarizeState(currentState);
		ctx.ui.setStatus(
			STATUS_KEY,
			ctx.ui.theme.fg("accent", `todo ${summary.completed}/${summary.total}`) +
				(summary.active ? ctx.ui.theme.fg("dim", ` • ${summary.active.id}`) : ""),
		);
		ctx.ui.setWidget(
			WIDGET_KEY,
			(_tui, theme) => ({
				render(width: number) {
					return formatWidgetLines(currentState, theme, width);
				},
				invalidate() {},
			}),
			{ placement: "belowEditor" },
		);
	};

	const commitAppliedResult = (event: TodoEvent, result: ApplyResult, ctx: ExtensionContext) => {
		currentState = result.state;
		appendTodoEvent(event);
		if (event.type !== "missed_update") todoToolCalledThisRun = true;
		updateUi(ctx);
	};

	const applyAndPersist = async (event: TodoEvent, ctx: ExtensionContext): Promise<ApplyResult> => {
		const previousSyncPath = currentState?.syncPath;
		const result = applyTodoEvent(currentState, event);
		if (!result.error && result.changed) {
			commitAppliedResult(event, result, ctx);
			if (event.type === "clear" && previousSyncPath) {
				try {
					await writeMarkdownToPath(previousSyncPath, createEmptyState(undefined, event.timestamp), ctx);
				} catch (error) {
					result.warnings.push(`Auto-sync clear failed: ${errorMessage(error)}`);
				}
			} else if (currentState?.syncPath && shouldAutoSync(event)) {
				try {
					await writeMarkdownToPath(currentState.syncPath, currentState, ctx);
				} catch (error) {
					result.warnings.push(`Auto-sync failed: ${errorMessage(error)}`);
				}
			}
			updateUi(ctx);
		}
		return result;
	};

	const applySyncPathEvent = async (event: Extract<TodoEvent, { type: "set_sync_path" }>, ctx: ExtensionContext): Promise<ApplyResult & { path?: string }> => {
		const result = applyTodoEvent(currentState, event);
		if (result.error || !result.changed) return result;
		let path: string | undefined;
		if (result.state?.syncPath) {
			try {
				path = await writeMarkdownToPath(result.state.syncPath, result.state, ctx);
			} catch (error) {
				return {
					...result,
					state: currentState,
					changed: false,
					error: `Sync path not saved: ${errorMessage(error)}`,
				};
			}
		}
		commitAppliedResult(event, result, ctx);
		return path ? { ...result, message: `Sync path set to ${path}`, path } : result;
	};

	pi.on("session_start", async (_event, ctx) => reconstruct(ctx));
	pi.on("session_tree", async (_event, ctx) => reconstruct(ctx));

	pi.on("agent_start", async () => {
		todoToolCalledThisRun = false;
	});

	pi.on("before_agent_start", async (event) => {
		if (!hasOpenTodos(currentState)) return;
		return {
			systemPrompt: `${event.systemPrompt}\n\n${buildTodoSystemPrompt(currentState)}`,
		};
	});

	pi.on("agent_end", async (_event, ctx) => {
		if (hasTodos(currentState) && summarizeState(currentState).open === 0) {
			await applyAndPersist({ type: "clear", timestamp: nowIso() }, ctx);
			return;
		}

		if (!hasOpenTodos(currentState)) return;
		if (todoToolCalledThisRun) return;
		const result = await applyAndPersist({ type: "missed_update", timestamp: nowIso() }, ctx);
		const count = result.state?.missedUpdateCount ?? 0;
		if (!ctx.hasUI) return;
		if (count <= 1) {
			ctx.ui.notify("Todo progress is active; remember to update todo_write as steps change.", "info");
		} else {
			ctx.ui.notify(`Todo progress has missed ${count} assistant turn(s). Use todo_write to start/done/note/block.`, "warning");
		}
	});

	pi.registerTool({
		name: TODO_TOOL_NAME,
		label: "Todo",
		description:
			"Manage a phased todo/progress list for long chains of work. Use it to initialize phases, start and complete tasks, record notes/blocks, and import/export Markdown. Outputs are compact by default.",
		promptSnippet: "Manage a phased todo/progress list for long-running multi-step work",
		promptGuidelines: [
			"Use todo_write to track long or multi-step work when a todo/progress list exists or would improve clarity.",
			"Use todo_write start before beginning a tracked step, done when it is complete, block when user input is needed, and note for meaningful progress details.",
			"Keep todo_write lists phased and ordered; prefer append_tasks over replacing the whole list during execution.",
		],
		parameters: TodoWriteParams,
		prepareArguments(args) {
			if (!args || typeof args !== "object") return args;
			const input = args as Record<string, unknown>;
			if (typeof input.op === "string" && typeof input.action !== "string") return { ...input, action: input.op };
			return args;
		},
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			return enqueue(async () => {
				if (signal?.aborted) {
					return makeToolReturn("list", false, "Cancelled", currentState, { error: "cancelled" });
				}

				try {
					switch (params.action) {
						case "list": {
							const viewFilter = params.view === "active" || params.view === "remaining" ? params.view : undefined;
							return makeToolReturn("list", true, summaryPlain(summarizeState(currentState)), currentState, {
								viewExpanded: params.view === "expanded" || params.view === "remaining",
								viewFilter,
							});
						}

						case "export_markdown": {
							if (!currentState) return makeToolReturn(params.action, false, "No todo list", currentState, { error: "no todo list" });
							const markdown = exportTodoMarkdown(currentState);
							let path: string | undefined;
							if (params.path?.trim()) path = await writeMarkdownToPath(params.path, currentState, ctx);
							return makeToolReturn(params.action, true, path ? `Exported Markdown to ${path}` : "Exported Markdown", currentState, {
								markdown: path ? undefined : markdown,
								path,
							});
						}

						case "import_markdown": {
							const markdown = await getMarkdownInput(params, ctx);
							if (!markdown.trim()) return makeToolReturn(params.action, false, "No Markdown provided", currentState, { error: "markdown or path required" });
							const parsed = parseTodoMarkdown(markdown);
							const event: TodoEvent = {
								type: "import",
								title: parsed.title,
								phases: parsed.phases,
								replace: params.replace !== false,
								timestamp: nowIso(),
							};
							const result = await applyAndPersist(event, ctx);
							return makeToolReturn(params.action, !result.error, result.message, currentState, result);
						}

						case "set_sync_path": {
							const event: Extract<TodoEvent, { type: "set_sync_path" }> = { type: "set_sync_path", path: params.path?.trim() || undefined, timestamp: nowIso() };
							const result = await applySyncPathEvent(event, ctx);
							return makeToolReturn(params.action, !result.error, result.message, currentState, result);
						}

						default: {
							const event = buildEvent(params);
							if (typeof event === "string") return makeToolReturn(params.action, false, event, currentState, { error: event });
							const result = await applyAndPersist(event, ctx);
							return makeToolReturn(params.action, !result.error, result.message, currentState, result);
						}
					}
				} catch (error) {
					return makeToolReturn(params.action, false, errorMessage(error), currentState, { error: errorMessage(error) });
				}
			});
		},
		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold(`${TODO_TOOL_NAME} `)) + theme.fg("muted", args.action ?? "");
			if (args.taskId) text += ` ${theme.fg("accent", args.taskId)}`;
			if (args.phaseId) text += ` ${theme.fg("accent", args.phaseId)}`;
			if (args.title) text += ` ${theme.fg("dim", quote(args.title))}`;
			if (args.path) text += ` ${theme.fg("dim", args.path)}`;
			return new Text(text, 0, 0);
		},
		renderResult(result, { expanded }, theme) {
			const details = result.details as TodoToolRenderDetails | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}
			return new Text(formatToolDetails(details, theme, expanded), 0, 0);
		},
	});

	pi.registerCommand("todo", {
		description: "Show and manage the phased todo/progress list",
		handler: async (args, ctx) => {
			await enqueue(async () => {
				try {
					await handleTodoCommand(args, ctx);
				} catch (error) {
					notifyOrLog(ctx, errorMessage(error), "error");
				}
			});
		},
	});

	async function handleTodoCommand(args: string, ctx: ExtensionContext): Promise<void> {
		const { command, rest } = splitCommand(args);
		switch (command) {
			case "":
			case "open":
				if (!ctx.hasUI) {
					notifyOrLog(ctx, formatPlainForLlm(currentState, { expanded: true, maxTasks: 80 }), "info");
					return;
				}
				await ctx.ui.custom<void>((tui, theme, _kb, done) => {
					return new TodoPanel({
						theme,
						getState: () => currentState,
						mutate: (event) => applyAndPersist(event, ctx),
						notify: (message, type) => notifyOrLog(ctx, message, type),
						onClose: () => done(),
						requestRender: () => tui.requestRender(),
					});
				});
				updateUi(ctx);
				return;

			case "status":
			case "list":
				notifyOrLog(ctx, formatPlainForLlm(currentState, { expanded: command === "list", maxTasks: 120 }), "info");
				return;

			case "import": {
				const path = stripQuotes(rest || "TODO.md");
				const markdown = await readFile(resolveTodoPath(path, ctx.cwd), "utf8");
				const parsed = parseTodoMarkdown(markdown);
				const result = await applyAndPersist({ type: "import", title: parsed.title, phases: parsed.phases, replace: true, timestamp: nowIso() }, ctx);
				notifyOrLog(ctx, result.error ?? result.message, result.error ? "error" : result.warnings.length ? "warning" : "info");
				return;
			}

			case "export": {
				if (!currentState) {
					notifyOrLog(ctx, "No todo list to export", "warning");
					return;
				}
				const path = await writeMarkdownToPath(stripQuotes(rest || "TODO.md"), currentState, ctx);
				notifyOrLog(ctx, `Exported todos to ${path}`, "info");
				return;
			}

			case "sync": {
				const path = stripQuotes(rest);
				const event: Extract<TodoEvent, { type: "set_sync_path" }> = { type: "set_sync_path", path: path === "off" || path === "" ? undefined : path, timestamp: nowIso() };
				const result = await applySyncPathEvent(event, ctx);
				notifyOrLog(ctx, result.error ?? result.message, result.error ? "error" : "info");
				return;
			}

			case "clear": {
				if (ctx.hasUI) {
					const ok = await ctx.ui.confirm("Clear todos?", "This clears the todo state for the current branch.");
					if (!ok) return;
				}
				const result = await applyAndPersist({ type: "clear", timestamp: nowIso() }, ctx);
				notifyOrLog(ctx, result.message, "info");
				return;
			}

			case "hide": {
				const result = await applyAndPersist({ type: "set_widget_visible", visible: false, timestamp: nowIso() }, ctx);
				notifyOrLog(ctx, result.message, "info");
				return;
			}

			case "show": {
				const result = await applyAndPersist({ type: "set_widget_visible", visible: true, timestamp: nowIso() }, ctx);
				notifyOrLog(ctx, result.message, "info");
				return;
			}

			case "help":
			default:
				notifyOrLog(
					ctx,
					[
						"/todo commands:",
						"  /todo                 open progress panel",
						"  /todo status          compact status",
						"  /todo list            expanded status",
						"  /todo import TODO.md  import Markdown",
						"  /todo export TODO.md  export Markdown",
						"  /todo sync TODO.md    auto-export after mutations",
						"  /todo sync off        disable auto-export",
						"  /todo show|hide       toggle widget",
						"  /todo clear           clear current branch todos",
					].join("\n"),
					"info",
				);
		}
	}
}

function buildEvent(params: TodoWriteParams): TodoEvent | string {
	const timestamp = nowIso();
	switch (params.action) {
		case "init": {
			let phases: PhaseInput[] | undefined = normalizeToolPhases(params.phases);
			if (params.markdown?.trim()) {
				const parsed = parseTodoMarkdown(params.markdown);
				phases = parsed.phases;
				return { type: "init", title: params.title ?? parsed.title, phases, timestamp };
			}
			return { type: "init", title: params.title, phases, timestamp };
		}
		case "append_phase":
			if (!params.title?.trim()) return "title required for append_phase";
			return { type: "append_phase", title: params.title, tasks: params.tasks ?? [], timestamp };
		case "append_tasks":
			if (!params.tasks?.length) return "tasks required for append_tasks";
			return { type: "append_tasks", phaseId: params.phaseId, phaseTitle: params.phaseTitle, tasks: params.tasks, timestamp };
		case "start":
			if (!params.taskId?.trim()) return "taskId required for start";
			return { type: "start", taskId: params.taskId, timestamp };
		case "done":
			return { type: "done", taskId: params.taskId, note: params.note, timestamp };
		case "drop":
			if (!params.taskId?.trim()) return "taskId required for drop";
			return { type: "drop", taskId: params.taskId, reason: params.reason, timestamp };
		case "block":
			if (!params.reason?.trim()) return "reason required for block";
			return { type: "block", taskId: params.taskId, reason: params.reason, timestamp };
		case "note":
			if (typeof params.note !== "string") return "note required for note";
			return { type: "note", taskId: params.taskId, note: params.note, timestamp };
		case "clear":
			return { type: "clear", timestamp };
		default:
			return `unsupported action ${params.action}`;
	}
}

function normalizeToolPhases(phases: TodoWriteParams["phases"]): PhaseInput[] | undefined {
	if (!phases) return undefined;
	return phases.map((phase) => ({ title: phase.title, tasks: phase.tasks ?? [] }));
}

async function getMarkdownInput(params: TodoWriteParams, ctx: ExtensionContext): Promise<string> {
	if (params.markdown) return params.markdown;
	if (params.path?.trim()) return readFile(resolveTodoPath(params.path, ctx.cwd), "utf8");
	return "";
}

function makeToolReturn(
	action: string,
	ok: boolean,
	message: string,
	state: TodoState | undefined,
	extra?: Partial<ApplyResult> & { markdown?: string; path?: string; viewExpanded?: boolean; viewFilter?: "active" | "remaining" },
) {
	const summary = summarizeState(state);
	const expanded = extra?.viewExpanded === true;
	const details: TodoToolRenderDetails = {
		action,
		ok,
		message,
		summary,
		warnings: extra?.warnings,
		error: extra?.error,
		changedTaskId: extra?.changedTaskId,
		changedPhaseId: extra?.changedPhaseId,
		markdown: extra?.markdown,
		path: extra?.path,
		view: makeTodoView(state, { expanded, maxTasks: expanded ? 120 : 20, filter: extra?.viewFilter }),
	};

	const contentLines = [message, summaryPlain(summary)];
	if (extra?.warnings?.length) contentLines.push(...extra.warnings.map((warning) => `Warning: ${warning}`));
	if (extra?.error) contentLines.push(`Error: ${extra.error}`);
	if (extra?.path) contentLines.push(`Path: ${extra.path}`);
	if (extra?.markdown) contentLines.push("\n" + extra.markdown);
	else if (state && (action === "list" || action === "init" || action === "import_markdown")) {
		contentLines.push(formatPlainForLlm(state, { expanded, maxTasks: expanded ? 120 : 40, filter: extra?.viewFilter }));
	}

	return {
		content: [{ type: "text" as const, text: contentLines.filter(Boolean).join("\n") }],
		details,
	};
}

async function writeMarkdownToPath(pathArg: string, state: TodoState, ctx: ExtensionContext): Promise<string> {
	const absolutePath = resolveTodoPath(pathArg, ctx.cwd);
	const markdown = exportTodoMarkdown(state);
	await withFileMutationQueue(absolutePath, async () => {
		await mkdir(dirname(absolutePath), { recursive: true });
		await writeFile(absolutePath, markdown, "utf8");
	});
	return absolutePath;
}

function resolveTodoPath(pathArg: string, cwd: string): string {
	const clean = stripQuotes(pathArg).replace(/^@/, "");
	const absolutePath = resolve(cwd, clean || "TODO.md");
	const relativePath = relative(cwd, absolutePath);
	if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
		throw new Error(`Todo paths must stay inside the current working directory: ${pathArg}`);
	}
	return absolutePath;
}

function shouldAutoSync(event: TodoEvent): boolean {
	return event.type !== "set_sync_path" && event.type !== "missed_update";
}

function buildTodoSystemPrompt(state: TodoState): string {
	const plain = formatPlainForLlm(state, { expanded: false, maxTasks: 24 });
	return `## Active todo progress\n${plain}\n\nA phased todo list is active. Use the ${TODO_TOOL_NAME} tool to keep it current during long-running work:\n- Call ${TODO_TOOL_NAME} action=\"start\" before beginning a tracked task.\n- Call ${TODO_TOOL_NAME} action=\"done\" when a tracked task is complete.\n- Call ${TODO_TOOL_NAME} action=\"note\" for meaningful progress details, or action=\"block\" if user input is needed.\n- Preserve ordered phase progress unless there is a good reason to skip ahead.`;
}

function notifyOrLog(ctx: ExtensionContext, message: string, type: "info" | "warning" | "error" = "info"): void {
	if (ctx.hasUI) ctx.ui.notify(message, type);
	else console.log(message);
}

function splitCommand(args: string): { command: string; rest: string } {
	const trimmed = args.trim();
	if (!trimmed) return { command: "", rest: "" };
	const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(trimmed);
	return { command: match?.[1]?.toLowerCase() ?? "", rest: match?.[2]?.trim() ?? "" };
}

function stripQuotes(value: string): string {
	const trimmed = value.trim();
	if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

function quote(value: string): string {
	return `"${value.replace(/"/g, '\\"')}"`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
