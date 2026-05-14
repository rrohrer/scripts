import type { Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import {
	getPhaseCounts,
	hasTodos,
	summarizeState,
	type TodoPhase,
	type TodoState,
	type TodoStatus,
	type TodoSummary,
	type TodoTask,
} from "./state.js";

export interface TodoViewTask {
	id: string;
	text: string;
	status: TodoStatus;
	note?: string;
}

export interface TodoViewPhase {
	id: string;
	title: string;
	completed: number;
	total: number;
	collapsed?: boolean;
	tasks: TodoViewTask[];
	hiddenTasks: number;
}

export interface TodoView {
	phases: TodoViewPhase[];
	hiddenPhases: number;
	hiddenTasks: number;
}

export interface TodoToolRenderDetails {
	action: string;
	ok: boolean;
	message: string;
	summary: TodoSummary;
	warnings?: string[];
	error?: string;
	changedTaskId?: string;
	changedPhaseId?: string;
	markdown?: string;
	path?: string;
	view?: TodoView;
}

const STATUS_ICON: Record<TodoStatus, string> = {
	pending: "○",
	in_progress: "▶",
	completed: "✓",
	abandoned: "⊘",
	blocked: "!",
};

export function statusIcon(status: TodoStatus): string {
	return STATUS_ICON[status] ?? "○";
}

export function styledStatusIcon(status: TodoStatus, theme: Theme): string {
	const icon = statusIcon(status);
	switch (status) {
		case "completed":
			return theme.fg("success", icon);
		case "in_progress":
			return theme.fg("accent", icon);
		case "blocked":
			return theme.fg("warning", icon);
		case "abandoned":
			return theme.fg("dim", icon);
		case "pending":
		default:
			return theme.fg("muted", icon);
	}
}

export function makeTodoView(
	state: TodoState | undefined,
	options?: { expanded?: boolean; maxTasks?: number; filter?: "active" | "remaining" },
): TodoView {
	if (!state) return { phases: [], hiddenPhases: 0, hiddenTasks: 0 };
	const expanded = options?.expanded === true;
	const maxTasks = options?.maxTasks ?? (expanded ? 80 : 12);
	const filter = options?.filter;
	let remainingTasks = maxTasks;
	let hiddenPhases = 0;
	let hiddenTasks = 0;
	const phases: TodoViewPhase[] = [];

	for (const phase of state.phases) {
		const counts = getPhaseCounts(phase);
		const candidateTasks = filterPhaseTasks(phase, filter);
		if (filter && candidateTasks.length === 0) continue;
		const hasActive = phase.tasks.some((task) => task.status === "in_progress" || task.status === "blocked");
		const phaseIsBoring = counts.total > 0 && counts.open === 0 && !hasActive;
		if (!filter && !expanded && phaseIsBoring && phases.length >= 2) {
			hiddenPhases++;
			hiddenTasks += phase.tasks.length;
			continue;
		}

		const shouldCollapseTasks = !filter && !expanded && (phase.collapsed || phaseIsBoring);
		const visibleTasks: TodoTask[] = [];
		if (!shouldCollapseTasks) {
			for (const task of choosePhaseTasks(phase, expanded, candidateTasks)) {
				if (remainingTasks <= 0) {
					hiddenTasks++;
					continue;
				}
				visibleTasks.push(task);
				remainingTasks--;
			}
		}
		const explicitlyHidden = Math.max(0, candidateTasks.length - visibleTasks.length);
		phases.push({
			id: phase.id,
			title: phase.title,
			completed: counts.completed,
			total: counts.total,
			collapsed: shouldCollapseTasks,
			tasks: visibleTasks.map((task) => ({
				id: task.id,
				text: task.text,
				status: task.status,
				note: task.note,
			})),
			hiddenTasks: explicitlyHidden,
		});
	}

	return { phases, hiddenPhases, hiddenTasks };
}

export function formatWidgetLines(state: TodoState | undefined, theme: Theme, width: number): string[] {
	if (!hasTodos(state)) return [];
	const summary = summarizeState(state);
	const remaining = summary.open;
	const denominator = Math.max(1, summary.completed + remaining);
	const barWidth = Math.max(8, Math.min(28, width - 44));
	const filled = Math.max(0, Math.min(barWidth, Math.round((summary.completed / denominator) * barWidth)));
	const empty = Math.max(0, barWidth - filled);
	const bar = theme.fg("success", "█".repeat(filled)) + theme.fg("dim", "░".repeat(empty));
	const remainingText = remaining === 1 ? "1 remaining" : `${remaining} remaining`;
	const completedText = summary.completed === 1 ? "1 completed" : `${summary.completed} completed`;
	return [fit(`${theme.fg("accent", "Todo")} [${bar}] ${theme.fg("success", completedText)} ${theme.fg("dim", "•")} ${theme.fg("muted", remainingText)}`, width)];
}

export function formatToolDetails(details: TodoToolRenderDetails, theme: Theme, expanded: boolean): string {
	if (!details.ok || details.error) {
		return theme.fg("error", `todo_write: ${details.error ?? details.message}`);
	}

	const lines: string[] = [];
	lines.push(theme.fg("success", "✓ ") + theme.fg("muted", details.message));
	lines.push(theme.fg("dim", summaryPlain(details.summary)));
	for (const warning of details.warnings ?? []) {
		lines.push(theme.fg("warning", `warning: ${warning}`));
	}
	if (details.path) lines.push(theme.fg("dim", `path: ${details.path}`));
	if (details.markdown && expanded) {
		lines.push("");
		lines.push(details.markdown);
	}
	if (details.view && (expanded || details.action === "list" || details.action === "init")) {
		lines.push("");
		lines.push(formatView(details.view, theme, expanded));
	}
	return lines.filter(Boolean).join("\n");
}

export function formatPlainForLlm(
	state: TodoState | undefined,
	options?: { expanded?: boolean; maxTasks?: number; filter?: "active" | "remaining" },
): string {
	const summary = summarizeState(state);
	const lines = [summaryPlain(summary)];
	const view = makeTodoView(state, { expanded: options?.expanded, maxTasks: options?.maxTasks, filter: options?.filter });
	if (view.phases.length === 0) return lines.join("\n");
	lines.push(plainView(view));
	return lines.join("\n");
}

export function summaryPlain(summary: TodoSummary): string {
	if (summary.total === 0) return "No todos";
	const parts = [`${summary.completed}/${summary.total} complete`, `${summary.open} open`];
	if (summary.blocked) parts.push(`${summary.blocked} blocked`);
	if (summary.active) parts.push(`active ${summary.active.id}: ${summary.active.text}`);
	if (summary.next) parts.push(`next ${summary.next.id}: ${summary.next.text}`);
	return parts.join(" • ");
}

function formatView(view: TodoView, theme: Theme, expanded: boolean): string {
	const lines: string[] = [];
	for (const phase of view.phases) {
		const marker = phase.collapsed && !expanded ? "▸" : "▾";
		lines.push(`${theme.fg("muted", marker)} ${theme.fg("accent", phase.title)} ${theme.fg("dim", `${phase.completed}/${phase.total}`)}`);
		for (const task of phase.tasks) {
			const text = task.status === "completed" || task.status === "abandoned" ? theme.fg("dim", task.text) : theme.fg("muted", task.text);
			lines.push(`  ${styledStatusIcon(task.status, theme)} ${theme.fg("accent", task.id)} ${text}`);
			if (expanded && task.note) lines.push(`    ${theme.fg("dim", firstLine(task.note, 120))}`);
		}
		if (phase.hiddenTasks > 0) lines.push(`  ${theme.fg("dim", `… ${phase.hiddenTasks} hidden task(s)`)}`);
	}
	if (view.hiddenPhases > 0 || view.hiddenTasks > 0) {
		lines.push(theme.fg("dim", `… ${view.hiddenPhases} hidden phase(s), ${view.hiddenTasks} hidden task(s)`));
	}
	return lines.join("\n");
}

function plainView(view: TodoView): string {
	const lines: string[] = [];
	for (const phase of view.phases) {
		lines.push(`- ${phase.title} (${phase.completed}/${phase.total})`);
		for (const task of phase.tasks) {
			lines.push(`  ${statusIcon(task.status)} ${task.id} ${task.text}`);
			if (task.note) lines.push(`    note: ${firstLine(task.note, 160)}`);
		}
		if (phase.hiddenTasks > 0) lines.push(`  ... ${phase.hiddenTasks} hidden task(s)`);
	}
	if (view.hiddenPhases > 0 || view.hiddenTasks > 0) lines.push(`... ${view.hiddenPhases} hidden phase(s), ${view.hiddenTasks} hidden task(s)`);
	return lines.join("\n");
}

function choosePhaseTasks(phase: TodoPhase, expanded: boolean, candidates = phase.tasks): TodoTask[] {
	if (expanded) return candidates;
	if (candidates.length !== phase.tasks.length) return candidates;
	const activeOrBlocked = candidates.filter((task) => task.status === "in_progress" || task.status === "blocked");
	const pending = candidates.filter((task) => task.status === "pending").slice(0, 3);
	const recentDone = [...candidates].filter((task) => task.status === "completed").slice(-1);
	const selected = [...activeOrBlocked, ...pending, ...recentDone];
	const seen = new Set<string>();
	return selected.filter((task) => {
		if (seen.has(task.id)) return false;
		seen.add(task.id);
		return true;
	});
}

function filterPhaseTasks(phase: TodoPhase, filter: "active" | "remaining" | undefined): TodoTask[] {
	if (filter === "active") return phase.tasks.filter((task) => task.status === "in_progress");
	if (filter === "remaining") return phase.tasks.filter((task) => task.status === "pending" || task.status === "in_progress" || task.status === "blocked");
	return phase.tasks;
}

function fit(line: string, width: number): string {
	return truncateToWidth(line, Math.max(1, width));
}

function firstLine(text: string, maxLength: number): string {
	const line = text.trim().split(/\r?\n/, 1)[0]?.replace(/\s+/g, " ") ?? "";
	return line.length <= maxLength ? line : `${line.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
