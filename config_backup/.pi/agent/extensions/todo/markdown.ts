import type { PhaseInput, TaskInput, TodoState, TodoStatus } from "./state.js";

export interface ParsedTodoMarkdown {
	title?: string;
	phases: PhaseInput[];
}

const STATUS_TO_MARKER: Record<TodoStatus, string> = {
	pending: " ",
	in_progress: ">",
	completed: "x",
	abandoned: "-",
	blocked: "!",
};

const MARKER_TO_STATUS: Record<string, TodoStatus> = {
	" ": "pending",
	x: "completed",
	X: "completed",
	">": "in_progress",
	"-": "abandoned",
	"!": "blocked",
};

export function parseTodoMarkdown(markdown: string): ParsedTodoMarkdown {
	const lines = markdown.split(/\r?\n/);
	let title: string | undefined;
	const phases: PhaseInput[] = [];
	let currentPhase: PhaseInput | undefined;
	let currentTask: TaskInput | undefined;

	const ensurePhase = () => {
		if (!currentPhase) {
			currentPhase = { title: "Todo", tasks: [] };
			phases.push(currentPhase);
		}
		return currentPhase;
	};

	for (const rawLine of lines) {
		const line = rawLine.replace(/\s+$/g, "");
		const h1 = /^#\s+(.+?)\s*$/.exec(line);
		if (h1) {
			if (!title) title = cleanTitle(h1[1]!);
			currentTask = undefined;
			continue;
		}

		const h2 = /^##\s+(.+?)\s*$/.exec(line);
		if (h2) {
			currentPhase = { title: cleanPhaseTitle(h2[1]!), tasks: [] };
			phases.push(currentPhase);
			currentTask = undefined;
			continue;
		}

		const taskMatch = /^\s*[-*]\s+\[([ xX>!\-])\]\s+(.+?)\s*$/.exec(line);
		if (taskMatch) {
			const marker = taskMatch[1]!;
			const rawText = taskMatch[2]!;
			const idMatch = /<!--\s*todo:id=([^\s>]+)\s*-->/.exec(rawText);
			const text = rawText.replace(/<!--\s*todo:id=[^>]+-->/g, "").trim();
			if (!text) continue;
			currentTask = {
				id: idMatch?.[1],
				text,
				status: MARKER_TO_STATUS[marker] ?? "pending",
			};
			const phase = ensurePhase();
			phase.tasks = [...(phase.tasks ?? []), currentTask];
			continue;
		}

		const noteMatch = /^\s+(?:[-*]\s+)?note:\s*(.*?)\s*$/i.exec(line);
		if (noteMatch && currentTask) {
			const note = noteMatch[1]?.trim() ?? "";
			if (note) currentTask.note = currentTask.note ? `${currentTask.note}\n${note}` : note;
			continue;
		}
	}

	return { title, phases };
}

export function exportTodoMarkdown(state: TodoState): string {
	const lines: string[] = [];
	lines.push(`# Todo${state.title ? `: ${state.title}` : ""}`);
	lines.push("");

	if (state.phases.length === 0) {
		lines.push("_No todo phases._");
		lines.push("");
		return lines.join("\n");
	}

	for (const phase of state.phases) {
		lines.push(`## ${phase.title}`);
		lines.push("");
		if (phase.tasks.length === 0) {
			lines.push("_No tasks._");
			lines.push("");
			continue;
		}

		for (const task of phase.tasks) {
			const marker = STATUS_TO_MARKER[task.status] ?? " ";
			lines.push(`- [${marker}] ${task.text} <!-- todo:id=${task.id} -->`);
			if (task.note?.trim()) {
				const noteLines = task.note.trim().split(/\r?\n/);
				for (const noteLine of noteLines) {
					lines.push(`  - note: ${noteLine}`);
				}
			}
		}
		lines.push("");
	}

	return lines.join("\n");
}

function cleanTitle(value: string): string | undefined {
	const stripped = value.replace(/^Todo\s*:?\s*/i, "").trim();
	return stripped.length > 0 ? stripped : undefined;
}

function cleanPhaseTitle(value: string): string {
	return value.replace(/^Phase\s+\d+\s*:?\s*/i, "").trim() || value.trim() || "Todo";
}
