---
description: Use sparky to do mundane coding tasks
argument-hint: "<task>"
---
Use the `sparky` subagent to complete this coding task:

$ARGUMENTS

Before delegating, assemble a complete handoff for `sparky`:
- Include the user's exact task, acceptance criteria, non-goals, and any constraints from the current conversation.
- Include relevant project instructions and architecture/allocation/testing requirements.
- Include relevant file paths, diffs, plans, and decisions already made.
- Include validation commands that should be run, or explain the best focused validation if uncertain.
- `sparky` already defaults to reading `context.md`, `plan.md`, and `progress.md`; pass any additional task-specific files or summarize their relevant contents when needed.

Delegate with the `subagent` tool using `agent: "sparky"`. Keep the parent/orchestrator responsible for decisions: if `sparky` reports a blocker or unapproved product/architecture/scope choice, ask the user or decide explicitly before continuing.

After `sparky` completes, review its completion report, inspect any important changes when appropriate, and summarize the outcome to the user with changed files, validation, and remaining risks.
