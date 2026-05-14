import assert from "node:assert/strict";
import test from "node:test";
import { applyTodoEvent, nowIso, summarizeState, type TodoState } from "./state.ts";

test("todo reducer initializes, starts, and completes active task", () => {
	let state: TodoState | undefined;
	state = applyTodoEvent(state, {
		type: "init",
		title: "Test",
		phases: [{ title: "Phase", tasks: ["A", "B"] }],
		timestamp: nowIso(),
	}).state;
	assert.equal(summarizeState(state).total, 2);

	let result = applyTodoEvent(state, { type: "start", taskId: "t1", timestamp: nowIso() });
	assert.equal(result.error, undefined);
	state = result.state;
	assert.equal(summarizeState(state).active?.id, "t1");

	result = applyTodoEvent(state, { type: "done", timestamp: nowIso() });
	assert.equal(result.error, undefined);
	state = result.state;
	const summary = summarizeState(state);
	assert.equal(summary.completed, 1);
	assert.equal(summary.active, undefined);
});

test("todo reducer keeps only one active task", () => {
	let state = applyTodoEvent(undefined, {
		type: "init",
		phases: [{ title: "Phase", tasks: ["A", "B"] }],
		timestamp: nowIso(),
	}).state;
	state = applyTodoEvent(state, { type: "start", taskId: "t1", timestamp: nowIso() }).state;
	state = applyTodoEvent(state, { type: "start", taskId: "t2", timestamp: nowIso() }).state;
	const summary = summarizeState(state);
	assert.equal(summary.active?.id, "t2");
	assert.equal(summary.inProgress, 1);
	assert.equal(summary.pending, 1);
});

test("todo reducer rejects blank append_tasks", () => {
	const result = applyTodoEvent(undefined, {
		type: "append_tasks",
		phaseTitle: "Phase",
		tasks: ["   "],
		timestamp: nowIso(),
	});
	assert.equal(result.changed, false);
	assert.equal(result.error, "at least one non-empty task required");
});

test("todo reducer clears stale lifecycle metadata", () => {
	let state = applyTodoEvent(undefined, {
		type: "init",
		phases: [{ title: "Phase", tasks: ["A"] }],
		timestamp: nowIso(),
	}).state;
	state = applyTodoEvent(state, { type: "start", taskId: "t1", timestamp: nowIso() }).state;
	state = applyTodoEvent(state, { type: "done", taskId: "t1", timestamp: nowIso() }).state;
	state = applyTodoEvent(state, { type: "drop", taskId: "t1", timestamp: nowIso() }).state;
	const task = state?.phases[0]?.tasks[0];
	assert.equal(task?.status, "abandoned");
	assert.equal(task?.completedAt, undefined);

	const doneAgain = applyTodoEvent(state, { type: "done", taskId: "t1", timestamp: nowIso() });
	assert.equal(doneAgain.changed, false);
	assert.equal(doneAgain.error, "cannot complete abandoned task");
});
