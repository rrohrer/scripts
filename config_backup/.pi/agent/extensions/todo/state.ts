export const TODO_CUSTOM_TYPE = "todo";
export const TODO_TOOL_NAME = "todo_write";
export const TODO_VERSION = 1 as const;

export const TODO_STATUSES = ["pending", "in_progress", "completed", "abandoned", "blocked"] as const;

export type TodoStatus = (typeof TODO_STATUSES)[number];

export interface TodoTask {
	id: string;
	text: string;
	status: TodoStatus;
	note?: string;
	createdAt: string;
	updatedAt: string;
	completedAt?: string;
	abandonedAt?: string;
	blockedAt?: string;
}

export interface TodoPhase {
	id: string;
	title: string;
	tasks: TodoTask[];
	collapsed?: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface TodoState {
	version: typeof TODO_VERSION;
	title?: string;
	phases: TodoPhase[];
	activeTaskId?: string;
	syncPath?: string;
	widgetVisible: boolean;
	createdAt: string;
	updatedAt: string;
	nextTaskId: number;
	nextPhaseId: number;
	missedUpdateCount: number;
}

export interface TaskInput {
	id?: string;
	text: string;
	status?: TodoStatus;
	note?: string;
}

export interface PhaseInput {
	id?: string;
	title: string;
	tasks?: Array<string | TaskInput>;
	collapsed?: boolean;
}

export type TodoEvent =
	| { type: "init"; title?: string; phases?: PhaseInput[]; timestamp: string }
	| { type: "import"; title?: string; phases: PhaseInput[]; replace: boolean; timestamp: string }
	| { type: "append_phase"; title: string; tasks?: string[]; timestamp: string }
	| { type: "append_tasks"; phaseId?: string; phaseTitle?: string; tasks: string[]; timestamp: string }
	| { type: "start"; taskId: string; timestamp: string }
	| { type: "done"; taskId?: string; note?: string; timestamp: string }
	| { type: "drop"; taskId: string; reason?: string; timestamp: string }
	| { type: "block"; taskId?: string; reason: string; timestamp: string }
	| { type: "note"; taskId?: string; note: string; timestamp: string }
	| { type: "clear"; timestamp: string }
	| { type: "set_sync_path"; path?: string; timestamp: string }
	| { type: "set_widget_visible"; visible: boolean; timestamp: string }
	| { type: "collapse_phase"; phaseId: string; timestamp: string }
	| { type: "expand_phase"; phaseId: string; timestamp: string }
	| { type: "collapse_completed"; timestamp: string }
	| { type: "missed_update"; timestamp: string };

export interface TodoEntryData {
	kind: "event";
	event: TodoEvent;
	createdAt: string;
}

export interface TaskRef {
	phase: TodoPhase;
	task: TodoTask;
	phaseIndex: number;
	taskIndex: number;
}

export interface TodoSummary {
	title?: string;
	total: number;
	pending: number;
	inProgress: number;
	completed: number;
	abandoned: number;
	blocked: number;
	open: number;
	percentComplete: number;
	active?: {
		id: string;
		text: string;
		phaseId: string;
		phaseTitle: string;
	};
	next?: {
		id: string;
		text: string;
		phaseId: string;
		phaseTitle: string;
	};
}

export interface ApplyResult {
	state?: TodoState;
	changed: boolean;
	message: string;
	warnings: string[];
	error?: string;
	changedTaskId?: string;
	changedPhaseId?: string;
}

export function nowIso(): string {
	return new Date().toISOString();
}

export function cloneState(state: TodoState | undefined): TodoState | undefined {
	if (!state) return undefined;
	return {
		...state,
		phases: state.phases.map((phase) => ({
			...phase,
			tasks: phase.tasks.map((task) => ({ ...task })),
		})),
	};
}

export function createEmptyState(title: string | undefined, timestamp = nowIso()): TodoState {
	return {
		version: TODO_VERSION,
		title: cleanOptional(title),
		phases: [],
		widgetVisible: true,
		createdAt: timestamp,
		updatedAt: timestamp,
		nextTaskId: 1,
		nextPhaseId: 1,
		missedUpdateCount: 0,
	};
}

export function hasTodos(state: TodoState | undefined): state is TodoState {
	return !!state && state.phases.some((phase) => phase.tasks.length > 0);
}

export function hasOpenTodos(state: TodoState | undefined): state is TodoState {
	if (!hasTodos(state)) return false;
	const summary = summarizeState(state);
	return summary.open > 0 || !!summary.active;
}

export function summarizeState(state: TodoState | undefined): TodoSummary {
	const summary: TodoSummary = {
		title: state?.title,
		total: 0,
		pending: 0,
		inProgress: 0,
		completed: 0,
		abandoned: 0,
		blocked: 0,
		open: 0,
		percentComplete: 0,
	};
	if (!state) return summary;

	for (const phase of state.phases) {
		for (const task of phase.tasks) {
			summary.total++;
			switch (task.status) {
				case "pending":
					summary.pending++;
					break;
				case "in_progress":
					summary.inProgress++;
					summary.active = { id: task.id, text: task.text, phaseId: phase.id, phaseTitle: phase.title };
					break;
				case "completed":
					summary.completed++;
					break;
				case "abandoned":
					summary.abandoned++;
					break;
				case "blocked":
					summary.blocked++;
					break;
			}
		}
	}

	summary.open = summary.pending + summary.inProgress + summary.blocked;
	summary.percentComplete = summary.total === 0 ? 0 : Math.round((summary.completed / summary.total) * 100);

	const next = findNextPendingTask(state);
	if (next) {
		summary.next = { id: next.task.id, text: next.task.text, phaseId: next.phase.id, phaseTitle: next.phase.title };
	}

	return summary;
}

export function getPhaseCounts(phase: TodoPhase): { total: number; completed: number; abandoned: number; blocked: number; open: number } {
	let completed = 0;
	let abandoned = 0;
	let blocked = 0;
	for (const task of phase.tasks) {
		if (task.status === "completed") completed++;
		else if (task.status === "abandoned") abandoned++;
		else if (task.status === "blocked") blocked++;
	}
	const total = phase.tasks.length;
	return { total, completed, abandoned, blocked, open: total - completed - abandoned };
}

export function isPhaseComplete(phase: TodoPhase): boolean {
	return phase.tasks.length > 0 && phase.tasks.every((task) => task.status === "completed" || task.status === "abandoned");
}

export function findTask(state: TodoState | undefined, taskId: string | undefined): TaskRef | undefined {
	if (!state || !taskId) return undefined;
	for (let phaseIndex = 0; phaseIndex < state.phases.length; phaseIndex++) {
		const phase = state.phases[phaseIndex]!;
		for (let taskIndex = 0; taskIndex < phase.tasks.length; taskIndex++) {
			const task = phase.tasks[taskIndex]!;
			if (task.id === taskId) return { phase, task, phaseIndex, taskIndex };
		}
	}
	return undefined;
}

export function findActiveTask(state: TodoState | undefined): TaskRef | undefined {
	if (!state) return undefined;
	const byId = findTask(state, state.activeTaskId);
	if (byId && byId.task.status === "in_progress") return byId;
	for (const ref of iterateTasks(state)) {
		if (ref.task.status === "in_progress") return ref;
	}
	return undefined;
}

export function findNextPendingTask(state: TodoState | undefined): TaskRef | undefined {
	if (!state) return undefined;
	const refs = Array.from(iterateTasks(state));
	const activeIndex = refs.findIndex((ref) => ref.task.status === "in_progress");
	if (activeIndex >= 0) {
		for (let i = activeIndex + 1; i < refs.length; i++) {
			if (refs[i]!.task.status === "pending") return refs[i];
		}
	}
	return refs.find((ref) => ref.task.status === "pending");
}

export function* iterateTasks(state: TodoState): Generator<TaskRef> {
	for (let phaseIndex = 0; phaseIndex < state.phases.length; phaseIndex++) {
		const phase = state.phases[phaseIndex]!;
		for (let taskIndex = 0; taskIndex < phase.tasks.length; taskIndex++) {
			yield { phase, task: phase.tasks[taskIndex]!, phaseIndex, taskIndex };
		}
	}
}

export function applyTodoEvent(previous: TodoState | undefined, event: TodoEvent): ApplyResult {
	const warnings: string[] = [];
	const timestamp = event.timestamp || nowIso();

	if (event.type === "clear") {
		return { state: undefined, changed: true, message: "Cleared todo list", warnings };
	}

	let state = cloneState(previous);

	switch (event.type) {
		case "init": {
			state = createEmptyState(event.title, timestamp);
			for (const phaseInput of event.phases ?? []) addPhase(state, phaseInput, timestamp, warnings);
			normalizeActiveTask(state, warnings);
			return done(state, true, `${summarizeState(state).total} task(s) initialized`, warnings);
		}

		case "import": {
			state = event.replace || !state ? createEmptyState(event.title, timestamp) : state;
			if (event.title && !state.title) state.title = cleanOptional(event.title);
			for (const phaseInput of event.phases) addPhase(state, phaseInput, timestamp, warnings);
			normalizeActiveTask(state, warnings);
			touch(state, timestamp);
			return done(state, true, `${event.replace ? "Imported" : "Merged"} ${event.phases.length} phase(s)`, warnings);
		}

		case "append_phase": {
			state = ensureState(state, undefined, timestamp);
			const phase = addPhase(state, { title: event.title, tasks: event.tasks ?? [] }, timestamp, warnings);
			touch(state, timestamp);
			return done(state, true, `Added phase ${phase.id}: ${phase.title}`, warnings, undefined, phase.id);
		}

		case "append_tasks": {
			if (!event.tasks.length) return noChange(state, "No tasks provided", warnings, "tasks required");
			state = ensureState(state, undefined, timestamp);
			let phase = findPhase(state, event.phaseId, event.phaseTitle);
			if (!phase) {
				phase = addPhase(state, { title: event.phaseTitle || "Todo", tasks: [] }, timestamp, warnings);
				warnings.push(`Created phase ${phase.id} because no matching phase was found.`);
			}
			let added = 0;
			for (const taskText of event.tasks) {
				if (addTask(state, phase, taskText, timestamp, warnings)) added++;
			}
			if (added === 0) return noChange(state, "No non-empty tasks provided", warnings, "at least one non-empty task required");
			touchPhase(phase, timestamp);
			touch(state, timestamp);
			return done(state, true, `Added ${added} task(s) to ${phase.title}`, warnings, undefined, phase.id);
		}

		case "start": {
			if (!state) return noChange(state, "No todo list", warnings, "initialize todos first");
			const ref = findTask(state, event.taskId);
			if (!ref) return noChange(state, `Task ${event.taskId} not found`, warnings, `task ${event.taskId} not found`);
			if (ref.task.status === "completed" || ref.task.status === "abandoned") {
				return noChange(state, `Task ${event.taskId} is ${ref.task.status}`, warnings, `cannot start ${ref.task.status} task`);
			}
			const skipWarning = findSkippedTaskBefore(state, ref);
			if (skipWarning) warnings.push(skipWarning);
			for (const other of iterateTasks(state)) {
				if (other.task.id !== ref.task.id && other.task.status === "in_progress") {
					other.task.status = "pending";
					other.task.updatedAt = timestamp;
				}
			}
			ref.task.status = "in_progress";
			ref.task.updatedAt = timestamp;
			delete ref.task.completedAt;
			delete ref.task.abandonedAt;
			delete ref.task.blockedAt;
			state.activeTaskId = ref.task.id;
			state.missedUpdateCount = 0;
			touchPhase(ref.phase, timestamp);
			touch(state, timestamp);
			return done(state, true, `Started ${ref.task.id}: ${ref.task.text}`, warnings, ref.task.id, ref.phase.id);
		}

		case "done": {
			if (!state) return noChange(state, "No todo list", warnings, "initialize todos first");
			const ref = event.taskId ? findTask(state, event.taskId) : findActiveTask(state);
			if (!ref) return noChange(state, "No active or matching task", warnings, event.taskId ? `task ${event.taskId} not found` : "no active task");
			if (ref.task.status === "completed") return noChange(state, `${ref.task.id} already completed`, warnings);
			if (ref.task.status === "abandoned") return noChange(state, `${ref.task.id} is abandoned`, warnings, "cannot complete abandoned task");
			ref.task.status = "completed";
			ref.task.completedAt = timestamp;
			ref.task.updatedAt = timestamp;
			delete ref.task.abandonedAt;
			delete ref.task.blockedAt;
			if (event.note?.trim()) ref.task.note = event.note.trim();
			if (state.activeTaskId === ref.task.id) delete state.activeTaskId;
			state.missedUpdateCount = 0;
			touchPhase(ref.phase, timestamp);
			touch(state, timestamp);
			return done(state, true, `Completed ${ref.task.id}: ${ref.task.text}`, warnings, ref.task.id, ref.phase.id);
		}

		case "drop": {
			if (!state) return noChange(state, "No todo list", warnings, "initialize todos first");
			const ref = findTask(state, event.taskId);
			if (!ref) return noChange(state, `Task ${event.taskId} not found`, warnings, `task ${event.taskId} not found`);
			ref.task.status = "abandoned";
			ref.task.abandonedAt = timestamp;
			ref.task.updatedAt = timestamp;
			delete ref.task.completedAt;
			delete ref.task.blockedAt;
			if (event.reason?.trim()) ref.task.note = event.reason.trim();
			if (state.activeTaskId === ref.task.id) delete state.activeTaskId;
			state.missedUpdateCount = 0;
			touchPhase(ref.phase, timestamp);
			touch(state, timestamp);
			return done(state, true, `Abandoned ${ref.task.id}: ${ref.task.text}`, warnings, ref.task.id, ref.phase.id);
		}

		case "block": {
			if (!state) return noChange(state, "No todo list", warnings, "initialize todos first");
			const ref = event.taskId ? findTask(state, event.taskId) : findActiveTask(state);
			if (!ref) return noChange(state, "No active or matching task", warnings, event.taskId ? `task ${event.taskId} not found` : "no active task");
			if (ref.task.status === "completed" || ref.task.status === "abandoned") {
				return noChange(state, `${ref.task.id} is ${ref.task.status}`, warnings, `cannot block ${ref.task.status} task`);
			}
			ref.task.status = "blocked";
			ref.task.blockedAt = timestamp;
			ref.task.updatedAt = timestamp;
			delete ref.task.completedAt;
			delete ref.task.abandonedAt;
			ref.task.note = event.reason.trim();
			if (state.activeTaskId === ref.task.id) delete state.activeTaskId;
			state.missedUpdateCount = 0;
			touchPhase(ref.phase, timestamp);
			touch(state, timestamp);
			return done(state, true, `Blocked ${ref.task.id}: ${ref.task.text}`, warnings, ref.task.id, ref.phase.id);
		}

		case "note": {
			if (!state) return noChange(state, "No todo list", warnings, "initialize todos first");
			const ref = event.taskId ? findTask(state, event.taskId) : findActiveTask(state);
			if (!ref) return noChange(state, "No active or matching task", warnings, event.taskId ? `task ${event.taskId} not found` : "no active task");
			ref.task.note = event.note.trim();
			ref.task.updatedAt = timestamp;
			state.missedUpdateCount = 0;
			touchPhase(ref.phase, timestamp);
			touch(state, timestamp);
			return done(state, true, `Updated note for ${ref.task.id}`, warnings, ref.task.id, ref.phase.id);
		}

		case "set_sync_path": {
			state = ensureState(state, undefined, timestamp);
			state.syncPath = cleanOptional(event.path);
			touch(state, timestamp);
			return done(state, true, state.syncPath ? `Sync path set to ${state.syncPath}` : "Sync path cleared", warnings);
		}

		case "set_widget_visible": {
			state = ensureState(state, undefined, timestamp);
			state.widgetVisible = event.visible;
			touch(state, timestamp);
			return done(state, true, event.visible ? "Todo widget shown" : "Todo widget hidden", warnings);
		}

		case "collapse_phase": {
			if (!state) return noChange(state, "No todo list", warnings);
			const phase = findPhase(state, event.phaseId);
			if (!phase) return noChange(state, `Phase ${event.phaseId} not found`, warnings, `phase ${event.phaseId} not found`);
			phase.collapsed = true;
			touchPhase(phase, timestamp);
			touch(state, timestamp);
			return done(state, true, `Collapsed ${phase.title}`, warnings, undefined, phase.id);
		}

		case "expand_phase": {
			if (!state) return noChange(state, "No todo list", warnings);
			const phase = findPhase(state, event.phaseId);
			if (!phase) return noChange(state, `Phase ${event.phaseId} not found`, warnings, `phase ${event.phaseId} not found`);
			phase.collapsed = false;
			touchPhase(phase, timestamp);
			touch(state, timestamp);
			return done(state, true, `Expanded ${phase.title}`, warnings, undefined, phase.id);
		}

		case "collapse_completed": {
			if (!state) return noChange(state, "No todo list", warnings);
			let count = 0;
			for (const phase of state.phases) {
				if (isPhaseComplete(phase) && !phase.collapsed) {
					phase.collapsed = true;
					touchPhase(phase, timestamp);
					count++;
				}
			}
			touch(state, timestamp);
			return done(state, count > 0, `Collapsed ${count} completed phase(s)`, warnings);
		}

		case "missed_update": {
			if (!state) return noChange(state, "No todo list", warnings);
			state.missedUpdateCount = (state.missedUpdateCount ?? 0) + 1;
			touch(state, timestamp);
			return done(state, true, "Recorded missed todo update", warnings);
		}
	}
}

function done(
	state: TodoState | undefined,
	changed: boolean,
	message: string,
	warnings: string[],
	changedTaskId?: string,
	changedPhaseId?: string,
): ApplyResult {
	return { state, changed, message, warnings, changedTaskId, changedPhaseId };
}

function noChange(state: TodoState | undefined, message: string, warnings: string[], error?: string): ApplyResult {
	return { state, changed: false, message, warnings, error };
}

function ensureState(state: TodoState | undefined, title: string | undefined, timestamp: string): TodoState {
	return state ?? createEmptyState(title, timestamp);
}

function touch(state: TodoState, timestamp: string): void {
	state.updatedAt = timestamp;
}

function touchPhase(phase: TodoPhase, timestamp: string): void {
	phase.updatedAt = timestamp;
}

function addPhase(state: TodoState, input: PhaseInput, timestamp: string, warnings: string[]): TodoPhase {
	const title = cleanOptional(input.title) || `Phase ${state.nextPhaseId}`;
	const id = uniquePhaseId(state, input.id);
	const phase: TodoPhase = {
		id,
		title,
		tasks: [],
		collapsed: input.collapsed === true,
		createdAt: timestamp,
		updatedAt: timestamp,
	};
	state.phases.push(phase);
	bumpPhaseCounter(state, id);
	for (const taskInput of input.tasks ?? []) addTask(state, phase, taskInput, timestamp, warnings);
	return phase;
}

function addTask(state: TodoState, phase: TodoPhase, input: string | TaskInput, timestamp: string, warnings: string[]): TodoTask | undefined {
	const normalized: TaskInput = typeof input === "string" ? { text: input } : input;
	const text = cleanOptional(normalized.text);
	if (!text) return undefined;
	const id = uniqueTaskId(state, normalized.id);
	let status = normalized.status ?? "pending";
	if (status === "in_progress" && state.activeTaskId) {
		warnings.push(`Only one task can be active; imported ${id} as pending.`);
		status = "pending";
	}
	const task: TodoTask = {
		id,
		text,
		status,
		note: cleanOptional(normalized.note),
		createdAt: timestamp,
		updatedAt: timestamp,
	};
	if (status === "completed") task.completedAt = timestamp;
	if (status === "abandoned") task.abandonedAt = timestamp;
	if (status === "blocked") task.blockedAt = timestamp;
	if (status === "in_progress") state.activeTaskId = id;
	phase.tasks.push(task);
	bumpTaskCounter(state, id);
	return task;
}

function normalizeActiveTask(state: TodoState, warnings: string[]): void {
	let firstActive: TodoTask | undefined;
	for (const ref of iterateTasks(state)) {
		if (ref.task.status !== "in_progress") continue;
		if (!firstActive) {
			firstActive = ref.task;
			continue;
		}
		ref.task.status = "pending";
		warnings.push(`Only one task can be active; normalized ${ref.task.id} to pending.`);
	}
	state.activeTaskId = firstActive?.id;
}

function findPhase(state: TodoState, phaseId?: string, phaseTitle?: string): TodoPhase | undefined {
	if (phaseId) return state.phases.find((phase) => phase.id === phaseId);
	const title = cleanOptional(phaseTitle)?.toLowerCase();
	if (!title) return undefined;
	return state.phases.find((phase) => phase.title.toLowerCase() === title);
}

function findSkippedTaskBefore(state: TodoState, target: TaskRef): string | undefined {
	for (const ref of iterateTasks(state)) {
		if (ref.task.id === target.task.id) return undefined;
		if (ref.task.status === "pending" || ref.task.status === "blocked") {
			return `Starting ${target.task.id} skips earlier open task ${ref.task.id}.`;
		}
	}
	return undefined;
}

function uniqueTaskId(state: TodoState, requested: string | undefined): string {
	const existing = new Set(Array.from(iterateTasks(state), (ref) => ref.task.id));
	const clean = cleanOptional(requested);
	if (clean && !existing.has(clean)) return clean;
	let id = `t${state.nextTaskId}`;
	while (existing.has(id)) {
		state.nextTaskId++;
		id = `t${state.nextTaskId}`;
	}
	return id;
}

function uniquePhaseId(state: TodoState, requested: string | undefined): string {
	const existing = new Set(state.phases.map((phase) => phase.id));
	const clean = cleanOptional(requested);
	if (clean && !existing.has(clean)) return clean;
	let id = `p${state.nextPhaseId}`;
	while (existing.has(id)) {
		state.nextPhaseId++;
		id = `p${state.nextPhaseId}`;
	}
	return id;
}

function bumpTaskCounter(state: TodoState, id: string): void {
	const match = /^t(\d+)$/.exec(id);
	if (match) state.nextTaskId = Math.max(state.nextTaskId, Number(match[1]) + 1);
	else state.nextTaskId = Math.max(state.nextTaskId, state.phases.reduce((sum, phase) => sum + phase.tasks.length, 0) + 1);
}

function bumpPhaseCounter(state: TodoState, id: string): void {
	const match = /^p(\d+)$/.exec(id);
	if (match) state.nextPhaseId = Math.max(state.nextPhaseId, Number(match[1]) + 1);
	else state.nextPhaseId = Math.max(state.nextPhaseId, state.phases.length + 1);
}

function cleanOptional(value: string | undefined): string | undefined {
	if (typeof value !== "string") return undefined;
	const cleaned = value.trim();
	return cleaned.length > 0 ? cleaned : undefined;
}
