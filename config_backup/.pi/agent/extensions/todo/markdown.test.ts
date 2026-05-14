import assert from "node:assert/strict";
import test from "node:test";
import { exportTodoMarkdown, parseTodoMarkdown } from "./markdown.ts";
import { applyTodoEvent, nowIso } from "./state.ts";

test("todo markdown parses statuses and ids", () => {
	const parsed = parseTodoMarkdown(`# Todo: Demo

## Phase 1: Context

- [x] Inspect files <!-- todo:id=t7 -->
- [>] Implement feature <!-- todo:id=t8 -->
  - note: active note
- [!] Waiting on answer <!-- todo:id=t9 -->
`);
	assert.equal(parsed.title, "Demo");
	assert.equal(parsed.phases.length, 1);
	assert.equal(parsed.phases[0]?.title, "Context");
	const tasks = parsed.phases[0]?.tasks ?? [];
	assert.equal(tasks.length, 3);
	assert.deepEqual(tasks.map((task) => typeof task === "string" ? task : task.status), ["completed", "in_progress", "blocked"]);
	assert.equal(typeof tasks[1] === "string" ? undefined : tasks[1].note, "active note");
});

test("todo markdown exports and imports reducer state", () => {
	const state = applyTodoEvent(undefined, {
		type: "init",
		title: "Round Trip",
		phases: [{ title: "Build", tasks: ["One", "Two"] }],
		timestamp: nowIso(),
	}).state!;
	const markdown = exportTodoMarkdown(state);
	const parsed = parseTodoMarkdown(markdown);
	assert.equal(parsed.title, "Round Trip");
	assert.equal(parsed.phases[0]?.tasks?.length, 2);
});
