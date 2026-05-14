import type { Theme } from "@earendil-works/pi-coding-agent";
import { decodeKittyPrintable, Key, matchesKey, parseKey, truncateToWidth } from "@earendil-works/pi-tui";
import {
	findActiveTask,
	findTask,
	getPhaseCounts,
	isPhaseComplete,
	nowIso,
	summarizeState,
	type ApplyResult,
	type TodoEvent,
	type TodoPhase,
	type TodoState,
	type TodoTask,
} from "./state.js";
import { styledStatusIcon } from "./render.js";

type PanelMode = "normal" | "search" | "note";

type Row =
	| { kind: "phase"; phase: TodoPhase; phaseIndex: number }
	| { kind: "task"; phase: TodoPhase; task: TodoTask; phaseIndex: number; taskIndex: number };

interface TodoPanelOptions {
	theme: Theme;
	getState: () => TodoState | undefined;
	mutate: (event: TodoEvent) => Promise<ApplyResult>;
	notify: (message: string, type?: "info" | "warning" | "error") => void;
	onClose: () => void;
	requestRender: () => void;
}

export class TodoPanel {
	private selected = 0;
	private mode: PanelMode = "normal";
	private search = "";
	private inputBuffer = "";
	private noteTaskId?: string;
	private busy = false;
	private message?: { text: string; type: "info" | "warning" | "error" };
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(private options: TodoPanelOptions) {}

	handleInput(data: string): void {
		if (this.mode === "search") {
			this.handleSearchInput(data);
			return;
		}
		if (this.mode === "note") {
			this.handleNoteInput(data);
			return;
		}
		this.handleNormalInput(data);
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
		const state = this.options.getState();
		const theme = this.options.theme;
		const lines: string[] = [];
		const rows = this.rows();
		this.clampSelection(rows.length);

		lines.push("");
		lines.push(headerLine(theme, " Todo ", width));
		if (!state) {
			lines.push(fit(`  ${theme.fg("dim", "No todos. Ask the agent to call todo_write init, or use /todo import TODO.md.")}`, width));
			lines.push("");
			lines.push(fit(`  ${theme.fg("dim", "esc close")}`, width));
			return this.cache(width, lines);
		}

		const summary = summarizeState(state);
		const title = summary.title ? ` ${summary.title}` : "";
		lines.push(
			fit(
				`  ${theme.fg("accent", `${summary.completed}/${summary.total}`)} complete${title} ${theme.fg("dim", `${summary.open} open • ${summary.percentComplete}%`)}`,
				width,
			),
		);
		if (summary.active) lines.push(fit(`  ${theme.fg("accent", "active:")} ${summary.active.id} ${summary.active.text}`, width));
		if (this.search) lines.push(fit(`  ${theme.fg("muted", "filter:")} ${this.search}`, width));
		lines.push("");

		if (rows.length === 0) {
			lines.push(fit(`  ${theme.fg("dim", "No matching todos.")}`, width));
		} else {
			const maxRows = 20;
			const start = Math.max(0, Math.min(this.selected - Math.floor(maxRows / 2), rows.length - maxRows));
			const end = Math.min(rows.length, start + maxRows);
			if (start > 0) lines.push(fit(`  ${theme.fg("dim", `… ${start} row(s) above`)}`, width));
			for (let i = start; i < end; i++) lines.push(this.renderRow(rows[i]!, i, width));
			if (end < rows.length) lines.push(fit(`  ${theme.fg("dim", `… ${rows.length - end} row(s) below`)}`, width));
		}

		lines.push("");
		if (this.mode === "search") {
			lines.push(fit(`  ${theme.fg("accent", "/")} ${this.inputBuffer}${theme.fg("dim", "  enter apply • esc clear")}`, width));
		} else if (this.mode === "note") {
			lines.push(fit(`  ${theme.fg("accent", "note:")} ${this.inputBuffer}${theme.fg("dim", "  enter save • esc cancel")}`, width));
		} else if (this.busy) {
			lines.push(fit(`  ${theme.fg("warning", "updating…")}`, width));
		} else if (this.message) {
			const color = this.message.type === "error" ? "error" : this.message.type === "warning" ? "warning" : "dim";
			lines.push(fit(`  ${theme.fg(color, this.message.text)}`, width));
		} else {
			lines.push(
				fit(
					`  ${theme.fg("dim", "↑↓/j/k move • enter expand • s start • d done • x drop • n note • / search • c collapse • esc close")}`,
					width,
				),
			);
		}
		lines.push("");

		return this.cache(width, lines);
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}

	private handleNormalInput(data: string): void {
		if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
			this.options.onClose();
			return;
		}
		const rows = this.rows();
		if (matchesKey(data, Key.up) || matchesKey(data, "k")) {
			this.selected = Math.max(0, this.selected - 1);
			this.rerender();
			return;
		}
		if (matchesKey(data, Key.down) || matchesKey(data, "j")) {
			this.selected = Math.min(Math.max(0, rows.length - 1), this.selected + 1);
			this.rerender();
			return;
		}
		if (matchesKey(data, Key.pageUp)) {
			this.selected = Math.max(0, this.selected - 10);
			this.rerender();
			return;
		}
		if (matchesKey(data, Key.pageDown)) {
			this.selected = Math.min(Math.max(0, rows.length - 1), this.selected + 10);
			this.rerender();
			return;
		}
		if (matchesKey(data, Key.home)) {
			this.selected = 0;
			this.rerender();
			return;
		}
		if (matchesKey(data, Key.end)) {
			this.selected = Math.max(0, rows.length - 1);
			this.rerender();
			return;
		}
		if (matchesKey(data, Key.enter)) {
			const row = rows[this.selected];
			if (row?.kind === "phase") {
				void this.apply({ type: row.phase.collapsed ? "expand_phase" : "collapse_phase", phaseId: row.phase.id, timestamp: nowIso() });
			}
			return;
		}
		if (matchesKey(data, "s")) {
			const task = this.selectedTask(rows);
			if (!task) return this.setMessage("Select a task to start.", "warning");
			void this.apply({ type: "start", taskId: task.id, timestamp: nowIso() });
			return;
		}
		if (matchesKey(data, "d")) {
			const task = this.selectedTask(rows) ?? findActiveTask(this.options.getState())?.task;
			if (!task) return this.setMessage("No selected or active task to complete.", "warning");
			void this.apply({ type: "done", taskId: task.id, timestamp: nowIso() });
			return;
		}
		if (matchesKey(data, "x")) {
			const task = this.selectedTask(rows);
			if (!task) return this.setMessage("Select a task to abandon.", "warning");
			void this.apply({ type: "drop", taskId: task.id, reason: "Abandoned from /todo panel", timestamp: nowIso() });
			return;
		}
		if (matchesKey(data, "n")) {
			const task = this.selectedTask(rows) ?? findActiveTask(this.options.getState())?.task;
			if (!task) return this.setMessage("Select or start a task before adding a note.", "warning");
			this.mode = "note";
			this.noteTaskId = task.id;
			this.inputBuffer = task.note ?? "";
			this.rerender();
			return;
		}
		if (matchesKey(data, Key.slash)) {
			this.mode = "search";
			this.inputBuffer = this.search;
			this.rerender();
			return;
		}
		if (matchesKey(data, "c")) {
			void this.apply({ type: "collapse_completed", timestamp: nowIso() });
			return;
		}
		if (matchesKey(data, "e")) {
			this.options.notify("Use /todo export TODO.md to export Markdown.", "info");
			this.setMessage("Use /todo export TODO.md to export Markdown.", "info");
		}
	}

	private handleSearchInput(data: string): void {
		if (matchesKey(data, Key.escape)) {
			this.mode = "normal";
			this.search = "";
			this.inputBuffer = "";
			this.selected = 0;
			this.rerender();
			return;
		}
		if (matchesKey(data, Key.enter)) {
			this.mode = "normal";
			this.search = this.inputBuffer.trim();
			this.selected = 0;
			this.rerender();
			return;
		}
		this.updateInputBuffer(data);
	}

	private handleNoteInput(data: string): void {
		if (matchesKey(data, Key.escape)) {
			this.mode = "normal";
			this.inputBuffer = "";
			this.noteTaskId = undefined;
			this.rerender();
			return;
		}
		if (matchesKey(data, Key.enter)) {
			const taskId = this.noteTaskId;
			const note = this.inputBuffer.trim();
			this.mode = "normal";
			this.inputBuffer = "";
			this.noteTaskId = undefined;
			if (taskId) void this.apply({ type: "note", taskId, note, timestamp: nowIso() });
			return;
		}
		this.updateInputBuffer(data);
	}

	private updateInputBuffer(data: string): void {
		if (matchesKey(data, Key.backspace)) {
			this.inputBuffer = this.inputBuffer.slice(0, -1);
		} else {
			const printable = printableFromInput(data);
			if (printable) this.inputBuffer += printable.replace(/[\r\n]/g, " ");
		}
		this.rerender();
	}

	private async apply(event: TodoEvent): Promise<void> {
		if (this.busy) return;
		this.busy = true;
		this.rerender();
		try {
			const result = await this.options.mutate(event);
			this.message = {
				text: result.error ? result.error : [result.message, ...result.warnings.map((w) => `warning: ${w}`)].join(" • "),
				type: result.error ? "error" : result.warnings.length > 0 ? "warning" : "info",
			};
		} catch (error) {
			this.message = { text: error instanceof Error ? error.message : String(error), type: "error" };
		} finally {
			this.busy = false;
			this.rerender();
		}
	}

	private rows(): Row[] {
		const state = this.options.getState();
		if (!state) return [];
		const rows: Row[] = [];
		const query = this.search.trim().toLowerCase();
		for (let phaseIndex = 0; phaseIndex < state.phases.length; phaseIndex++) {
			const phase = state.phases[phaseIndex]!;
			const phaseMatches = !query || phase.title.toLowerCase().includes(query);
			const taskRows: Row[] = [];
			for (let taskIndex = 0; taskIndex < phase.tasks.length; taskIndex++) {
				const task = phase.tasks[taskIndex]!;
				const taskMatches =
					!query ||
					task.id.toLowerCase().includes(query) ||
					task.text.toLowerCase().includes(query) ||
					(task.note?.toLowerCase().includes(query) ?? false);
				if (taskMatches) taskRows.push({ kind: "task", phase, task, phaseIndex, taskIndex });
			}
			if (!phaseMatches && taskRows.length === 0) continue;
			rows.push({ kind: "phase", phase, phaseIndex });
			if (query || !phase.collapsed) rows.push(...taskRows);
		}
		return rows;
	}

	private renderRow(row: Row, index: number, width: number): string {
		const theme = this.options.theme;
		const selected = index === this.selected;
		const cursor = selected ? theme.fg("accent", ">") : " ";
		if (row.kind === "phase") {
			const counts = getPhaseCounts(row.phase);
			const fold = row.phase.collapsed ? "▸" : "▾";
			const done = isPhaseComplete(row.phase) ? theme.fg("success", `${counts.completed}/${counts.total}`) : theme.fg("dim", `${counts.completed}/${counts.total}`);
			return fit(`${cursor} ${theme.fg("muted", fold)} ${theme.fg("accent", row.phase.title)} ${done}`, width);
		}
		const task = row.task;
		const text = task.status === "completed" || task.status === "abandoned" ? theme.fg("dim", task.text) : task.text;
		const note = task.note ? theme.fg("dim", " · note") : "";
		return fit(`  ${cursor} ${styledStatusIcon(task.status, theme)} ${theme.fg("accent", task.id)} ${text}${note}`, width);
	}

	private selectedTask(rows: Row[]): TodoTask | undefined {
		const row = rows[this.selected];
		if (row?.kind === "task") return findTask(this.options.getState(), row.task.id)?.task;
		return undefined;
	}

	private clampSelection(rowCount: number): void {
		this.selected = Math.max(0, Math.min(this.selected, Math.max(0, rowCount - 1)));
	}

	private setMessage(text: string, type: "info" | "warning" | "error"): void {
		this.message = { text, type };
		this.rerender();
	}

	private rerender(): void {
		this.invalidate();
		this.options.requestRender();
	}

	private cache(width: number, lines: string[]): string[] {
		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}
}

function fit(line: string, width: number): string {
	return truncateToWidth(line, Math.max(1, width));
}

function printableFromInput(data: string): string | undefined {
	if (data.length === 1 && data >= " " && data !== "\x7f") return data;
	const kitty = decodeKittyPrintable(data);
	if (kitty) return kitty;
	const key = parseKey(data);
	if (!key) return undefined;
	if (key === "space") return " ";
	if (key.length === 1) return key;
	const shiftedLetter = /^shift\+([a-z])$/.exec(key);
	if (shiftedLetter) return shiftedLetter[1]!.toUpperCase();
	return undefined;
}

function headerLine(theme: Theme, title: string, width: number): string {
	const label = theme.fg("accent", title);
	const left = theme.fg("borderMuted", "─".repeat(3));
	const right = theme.fg("borderMuted", "─".repeat(Math.max(0, width - title.length - 3)));
	return fit(left + label + right, width);
}
