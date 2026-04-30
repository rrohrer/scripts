import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { stderr, stdin } from "node:process";
import { createInterface } from "node:readline/promises";
import { StringEnum } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Editor, type EditorTheme, Key, matchesKey, Text, truncateToWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import { Type, type Static } from "typebox";

const QUESTION_TYPES = ["text", "multiline", "confirm", "select", "multiselect"] as const;
const CUSTOM_TYPE = "interview";

type QuestionType = (typeof QUESTION_TYPES)[number];
type AnswerSource = "user" | "default" | "skipped";
type AnswerValue = string | boolean | string[] | null;
type Invocation = "tool" | "command";

interface RawOption {
	value: string;
	label?: string;
	description?: string;
	selected?: boolean;
}

interface RawQuestion {
	id: string;
	type?: QuestionType;
	label?: string;
	prompt: string;
	help?: string;
	required?: boolean;
	default?: unknown;
	placeholder?: string;
	options?: RawOption[];
	minItems?: number;
	maxItems?: number;
}

interface RawInterviewParams {
	title?: string;
	intro?: string;
	questions: RawQuestion[];
}

interface QuestionOption {
	value: string;
	label: string;
	description?: string;
	selected?: boolean;
}

interface Question {
	id: string;
	label: string;
	type: QuestionType;
	prompt: string;
	help?: string;
	required: boolean;
	defaultValue?: unknown;
	placeholder?: string;
	options: QuestionOption[];
	minItems?: number;
	maxItems?: number;
}

interface InterviewConfig {
	title: string;
	intro?: string;
	questions: Question[];
}

interface InterviewAnswer {
	id: string;
	label: string;
	type: QuestionType;
	value: AnswerValue;
	displayValue: string;
	skipped: boolean;
	source: AnswerSource;
}

interface InterviewResult {
	title: string;
	invocation: Invocation;
	questions: Question[];
	answers: InterviewAnswer[];
	cancelled: boolean;
	partial: boolean;
	keptPartial: boolean;
	saved: boolean;
	createdAt: string;
	error?: string;
}

const QuestionOptionSchema = Type.Object({
	value: Type.String({ description: "Stable value returned when selected" }),
	label: Type.Optional(Type.String({ description: "Human label shown in the TUI; defaults to value" })),
	description: Type.Optional(Type.String({ description: "Optional secondary text shown under the option" })),
	selected: Type.Optional(Type.Boolean({ description: "Initial/default selected state" })),
});

const QuestionSchema = Type.Object({
	id: Type.String({ description: "Stable answer key, for example 'scope' or 'tests'" }),
	type: Type.Optional(
		StringEnum(QUESTION_TYPES, {
			description: "Question input type. Defaults to 'select' when options are provided, otherwise 'text'.",
		}),
	),
	label: Type.Optional(Type.String({ description: "Short label used in progress/review screens" })),
	prompt: Type.String({ description: "Question text shown to the user" }),
	help: Type.Optional(Type.String({ description: "Optional help text shown below the prompt" })),
	required: Type.Optional(Type.Boolean({ description: "Whether the user must answer. Defaults to true." })),
	default: Type.Optional(Type.Any({ description: "Default value accepted when the user submits an empty answer" })),
	placeholder: Type.Optional(Type.String({ description: "Placeholder/help text for text answers" })),
	options: Type.Optional(Type.Array(QuestionOptionSchema, { description: "Options for select and multiselect" })),
	minItems: Type.Optional(Type.Number({ description: "Minimum selected options for multiselect" })),
	maxItems: Type.Optional(Type.Number({ description: "Maximum selected options for multiselect" })),
});

const InterviewParamsSchema = Type.Object({
	title: Type.Optional(Type.String({ description: "Title displayed at the top of the interview" })),
	intro: Type.Optional(Type.String({ description: "Short introduction/context displayed before questions" })),
	questions: Type.Array(QuestionSchema, { description: "Questions to ask the user" }),
});

type InterviewParams = Static<typeof InterviewParamsSchema>;

function normalizeParams(params: RawInterviewParams): InterviewConfig {
	const seenIds = new Set<string>();
	const rawQuestions = Array.isArray(params.questions) ? params.questions : [];
	const questions = rawQuestions.map((rawQuestion, index) => {
		const question = rawQuestion && typeof rawQuestion === "object"
			? rawQuestion
			: ({ id: `q${index + 1}`, prompt: valueToString(rawQuestion) || `Question ${index + 1}` } as RawQuestion);
		const rawOptions = Array.isArray(question.options) ? question.options : [];
		const explicitType = QUESTION_TYPES.includes(question.type as QuestionType) ? question.type : undefined;
		let type = explicitType ?? (rawOptions.length > 0 ? "select" : "text");

		const options = rawOptions.flatMap((rawOption): QuestionOption[] => {
			if (!rawOption || typeof rawOption !== "object") return [];
			const option = rawOption as RawOption;
			const fallbackValue = typeof option.label === "string" ? option.label : undefined;
			const value = typeof option.value === "string" ? option.value : fallbackValue;
			if (!value) return [];
			return [
				{
					value,
					label: typeof option.label === "string" && option.label.length > 0 ? option.label : value,
					description: typeof option.description === "string" ? option.description : undefined,
					selected: option.selected === true,
				},
			];
		});

		if ((type === "select" || type === "multiselect") && options.length === 0) {
			type = "text";
		}

		const rawId = typeof question.id === "string" ? question.id.trim() : "";
		let id = rawId || `q${index + 1}`;
		if (seenIds.has(id)) {
			let suffix = 2;
			while (seenIds.has(`${id}_${suffix}`)) suffix++;
			id = `${id}_${suffix}`;
		}
		seenIds.add(id);

		const prompt = typeof question.prompt === "string" && question.prompt.trim().length > 0 ? question.prompt : id;
		const label = typeof question.label === "string" && question.label.trim().length > 0 ? question.label.trim() : `Q${index + 1}`;

		return {
			id,
			label,
			type,
			prompt,
			help: typeof question.help === "string" ? question.help : undefined,
			required: question.required !== false,
			defaultValue: question.default,
			placeholder: typeof question.placeholder === "string" ? question.placeholder : undefined,
			options,
			minItems: typeof question.minItems === "number" ? question.minItems : undefined,
			maxItems: typeof question.maxItems === "number" ? question.maxItems : undefined,
		};
	});

	return {
		title: typeof params.title === "string" && params.title.trim().length > 0 ? params.title.trim() : "Interview",
		intro: typeof params.intro === "string" ? params.intro : undefined,
		questions,
	};
}

function valueToString(value: unknown): string {
	if (value === undefined || value === null) return "";
	if (Array.isArray(value)) return value.map(valueToString).join(", ");
	if (typeof value === "boolean") return value ? "Yes" : "No";
	return String(value);
}

function optionLabel(question: Question, value: string): string {
	return question.options.find((option) => option.value === value)?.label ?? value;
}

function displayValue(question: Question, value: AnswerValue): string {
	if (value === null) return "Skipped";
	if (question.type === "confirm") return value === true ? "Yes" : "No";
	if (question.type === "select" && typeof value === "string") return optionLabel(question, value);
	if (question.type === "multiselect" && Array.isArray(value)) {
		return value.length === 0 ? "None" : value.map((item) => optionLabel(question, item)).join(", ");
	}
	return valueToString(value);
}

function makeAnswer(question: Question, value: AnswerValue, source: AnswerSource): InterviewAnswer {
	return {
		id: question.id,
		label: question.label,
		type: question.type,
		value,
		displayValue: displayValue(question, value),
		skipped: source === "skipped",
		source,
	};
}

function makeSkipped(question: Question): InterviewAnswer {
	return makeAnswer(question, null, "skipped");
}

function coerceDefault(question: Question): AnswerValue | undefined {
	const raw = question.defaultValue;
	if (raw !== undefined) {
		if (question.type === "confirm") return raw === true || String(raw).toLowerCase() === "true";
		if (question.type === "multiselect") {
			if (Array.isArray(raw)) return raw.map(String);
			if (typeof raw === "string" && raw.trim().length > 0) return raw.split(",").map((item) => item.trim());
			return [];
		}
		return String(raw);
	}

	if (question.type === "select") {
		return question.options.find((option) => option.selected)?.value;
	}
	if (question.type === "multiselect") {
		const selected = question.options.filter((option) => option.selected).map((option) => option.value);
		return selected.length > 0 ? selected : undefined;
	}
	return undefined;
}

function sameAnswerValue(left: AnswerValue | undefined, right: AnswerValue | undefined): boolean {
	if (left === undefined || right === undefined) return false;
	if (Array.isArray(left) || Array.isArray(right)) {
		if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
		const rightValues = new Set(right);
		return left.every((value) => rightValues.has(value));
	}
	return left === right;
}

function sourceForValue(question: Question, value: AnswerValue): AnswerSource {
	return sameAnswerValue(value, coerceDefault(question)) ? "default" : "user";
}

function selectionOptions(question: Question): QuestionOption[] {
	if (question.required) return question.options;
	return [...question.options, { value: "__skip__", label: "Skip this question" }];
}

function summarizeAnswers(answers: InterviewAnswer[]): string {
	if (answers.length === 0) return "No answers.";
	return answers.map((answer) => `${answer.id}: ${answer.displayValue}${answer.source === "default" ? " (default)" : ""}`).join("\n");
}

function resultWith(
	config: InterviewConfig,
	invocation: Invocation,
	answers: InterviewAnswer[],
	cancelled: boolean,
	extra?: Partial<InterviewResult>,
): InterviewResult {
	return {
		title: config.title,
		invocation,
		questions: config.questions,
		answers,
		cancelled,
		partial: cancelled && answers.length > 0,
		keptPartial: false,
		saved: false,
		createdAt: new Date().toISOString(),
		...extra,
	};
}

async function runTuiInterview(
	config: InterviewConfig,
	invocation: Invocation,
	ctx: ExtensionContext,
	signal?: AbortSignal,
): Promise<InterviewResult> {
	return ctx.ui.custom<InterviewResult>((tui, theme, _keybindings, done) => {
		let currentIndex = 0;
		let selectedIndex = 0;
		let summaryIndex = 0;
		let loadedEditorQuestionId: string | undefined;
		let cachedWidth: number | undefined;
		let cachedLines: string[] | undefined;
		let validation: string | undefined;
		const answers = new Map<string, InterviewAnswer>();
		const multiDrafts = new Map<string, Set<string>>();

		const editorTheme: EditorTheme = {
			borderColor: (s) => theme.fg("accent", s),
			selectList: {
				selectedPrefix: (text) => theme.fg("accent", text),
				selectedText: (text) => theme.fg("accent", text),
				description: (text) => theme.fg("muted", text),
				scrollInfo: (text) => theme.fg("dim", text),
				noMatch: (text) => theme.fg("warning", text),
			},
		};
		const editor = new Editor(tui, editorTheme);

		function invalidate() {
			cachedWidth = undefined;
			cachedLines = undefined;
			tui.requestRender();
		}

		function currentQuestion(): Question | undefined {
			return config.questions[currentIndex];
		}

		function answerList(): InterviewAnswer[] {
			return config.questions.flatMap((question) => {
				const answer = answers.get(question.id);
				return answer ? [answer] : [];
			});
		}

		let finished = false;
		const abort = () => finish(true);
		signal?.addEventListener("abort", abort, { once: true });

		function finish(cancelled: boolean) {
			if (finished) return;
			finished = true;
			signal?.removeEventListener("abort", abort);
			done(resultWith(config, invocation, answerList(), cancelled));
		}

		if (signal?.aborted) finish(true);

		function goToQuestion(index: number) {
			currentIndex = Math.max(0, Math.min(index, config.questions.length));
			selectedIndex = initialSelectedIndex(currentQuestion());
			loadedEditorQuestionId = undefined;
			validation = undefined;
			invalidate();
		}

		function advance() {
			if (currentIndex < config.questions.length - 1) {
				goToQuestion(currentIndex + 1);
			} else {
				currentIndex = config.questions.length;
				validation = undefined;
				invalidate();
			}
		}

		function initialSelectedIndex(question: Question | undefined): number {
			if (!question) return 0;
			if (question.type === "confirm") {
				const existing = answers.get(question.id)?.value;
				const value = typeof existing === "boolean" ? existing : coerceDefault(question);
				return value === false ? 1 : 0;
			}
			if (question.type === "select") {
				const opts = selectionOptions(question);
				const existing = answers.get(question.id);
				const value = existing?.skipped ? "__skip__" : existing?.value ?? coerceDefault(question);
				const index = opts.findIndex((option) => option.value === value);
				return index >= 0 ? index : 0;
			}
			return 0;
		}

		function ensureEditorLoaded(question: Question) {
			if (loadedEditorQuestionId === question.id) return;
			const existing = answers.get(question.id);
			editor.setText(existing && !existing.skipped ? valueToString(existing.value) : "");
			loadedEditorQuestionId = question.id;
		}

		function ensureMultiDraft(question: Question): Set<string> {
			let draft = multiDrafts.get(question.id);
			if (draft) return draft;
			const existing = answers.get(question.id);
			const initial = existing && Array.isArray(existing.value) ? existing.value : coerceDefault(question);
			draft = new Set(Array.isArray(initial) ? initial : []);
			multiDrafts.set(question.id, draft);
			return draft;
		}

		function saveText(question: Question, value: string) {
			const normalized = question.type === "multiline" ? value.trimEnd() : value.trim();
			if (normalized.length > 0) {
				answers.set(question.id, makeAnswer(question, normalized, "user"));
				advance();
				return;
			}
			const defaultValue = coerceDefault(question);
			if (defaultValue !== undefined) {
				answers.set(question.id, makeAnswer(question, defaultValue, "default"));
				advance();
				return;
			}
			if (!question.required) {
				answers.set(question.id, makeSkipped(question));
				advance();
				return;
			}
			validation = "Answer required. Type a response or provide a default in the question schema.";
			invalidate();
		}

		editor.onSubmit = (value) => {
			const question = currentQuestion();
			if (!question || (question.type !== "text" && question.type !== "multiline")) return;
			saveText(question, value);
		};

		function saveConfirm(question: Question) {
			if (!question.required && selectedIndex === 2) {
				answers.set(question.id, makeSkipped(question));
			} else {
				const value = selectedIndex === 0;
				answers.set(question.id, makeAnswer(question, value, sourceForValue(question, value)));
			}
			advance();
		}

		function saveSelect(question: Question) {
			const selected = selectionOptions(question)[selectedIndex];
			if (!selected) return;
			if (selected.value === "__skip__") {
				answers.set(question.id, makeSkipped(question));
			} else {
				answers.set(question.id, makeAnswer(question, selected.value, sourceForValue(question, selected.value)));
			}
			advance();
		}

		function saveMultiselect(question: Question) {
			const selected = Array.from(ensureMultiDraft(question));
			const minItems = question.minItems ?? (question.required ? 1 : 0);
			const maxItems = question.maxItems ?? Number.POSITIVE_INFINITY;
			if (selected.length < minItems) {
				validation = minItems === 1 ? "Select at least one option." : `Select at least ${minItems} options.`;
				invalidate();
				return;
			}
			if (selected.length > maxItems) {
				validation = `Select no more than ${maxItems} options.`;
				invalidate();
				return;
			}
			answers.set(question.id, selected.length === 0 ? makeSkipped(question) : makeAnswer(question, selected, sourceForValue(question, selected)));
			advance();
		}

		function allRequiredAnswered(): boolean {
			return config.questions.every((question) => !question.required || (answers.has(question.id) && !answers.get(question.id)?.skipped));
		}

		function handleInput(data: string) {
			if (matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) {
				finish(true);
				return;
			}

			const question = currentQuestion();
			if (!question) {
				if (matchesKey(data, Key.up)) {
					summaryIndex = Math.max(0, summaryIndex - 1);
					invalidate();
					return;
				}
				if (matchesKey(data, Key.down)) {
					summaryIndex = Math.min(config.questions.length - 1, summaryIndex + 1);
					invalidate();
					return;
				}
				if (matchesKey(data, Key.enter)) {
					if (!allRequiredAnswered()) {
						validation = "Some required questions are unanswered. Select one to edit it.";
						invalidate();
						return;
					}
					finish(false);
					return;
				}
				if (data === "e" || matchesKey(data, Key.right)) {
					goToQuestion(summaryIndex);
					return;
				}
				return;
			}

			validation = undefined;
			if (question.type === "text" || question.type === "multiline") {
				ensureEditorLoaded(question);
				editor.handleInput(data);
				invalidate();
				return;
			}

			if (matchesKey(data, Key.up)) {
				selectedIndex = Math.max(0, selectedIndex - 1);
				invalidate();
				return;
			}
			if (matchesKey(data, Key.down)) {
				const max =
					question.type === "confirm" && !question.required
						? 2
						: question.type === "multiselect"
							? Math.max(0, question.options.length - 1)
							: Math.max(0, selectionOptions(question).length - 1);
				selectedIndex = Math.min(max, selectedIndex + 1);
				invalidate();
				return;
			}

			if (question.type === "confirm") {
				if (matchesKey(data, Key.left) || matchesKey(data, Key.right)) {
					selectedIndex = selectedIndex === 0 ? 1 : 0;
					invalidate();
					return;
				}
				if (matchesKey(data, Key.enter)) saveConfirm(question);
				return;
			}

			if (question.type === "select") {
				if (matchesKey(data, Key.enter)) saveSelect(question);
				return;
			}

			if (question.type === "multiselect") {
				const draft = ensureMultiDraft(question);
				const option = question.options[selectedIndex];
				if (matchesKey(data, Key.space) && option) {
					if (draft.has(option.value)) draft.delete(option.value);
					else draft.add(option.value);
					invalidate();
					return;
				}
				if (matchesKey(data, Key.enter)) saveMultiselect(question);
			}
		}

		function addWrapped(lines: string[], text: string, width: number, indent = 0) {
			const innerWidth = Math.max(1, width - indent);
			const prefix = " ".repeat(indent);
			for (const line of wrapTextWithAnsi(text, innerWidth)) {
				lines.push(truncateToWidth(prefix + line, width));
			}
		}

		function renderQuestion(lines: string[], width: number, question: Question) {
			addWrapped(lines, theme.fg("text", question.prompt), width, 1);
			if (question.help) addWrapped(lines, theme.fg("muted", question.help), width, 1);
			const defaultValue = coerceDefault(question);
			if (defaultValue !== undefined) {
				addWrapped(lines, theme.fg("dim", `Default: ${displayValue(question, defaultValue)}`), width, 1);
			}
			if (question.placeholder) addWrapped(lines, theme.fg("dim", question.placeholder), width, 1);
			lines.push("");

			if (question.type === "text" || question.type === "multiline") {
				ensureEditorLoaded(question);
				for (const line of editor.render(Math.max(1, width - 2))) {
					lines.push(truncateToWidth(` ${line}`, width));
				}
				return;
			}

			if (question.type === "confirm") {
				const options = question.required ? ["Yes", "No"] : ["Yes", "No", "Skip this question"];
				for (let i = 0; i < options.length; i++) {
					const selected = i === selectedIndex;
					const prefix = selected ? theme.fg("accent", "> ") : "  ";
					const text = selected ? theme.fg("accent", options[i]) : theme.fg("text", options[i]);
					lines.push(truncateToWidth(`${prefix}${i + 1}. ${text}`, width));
				}
				return;
			}

			if (question.type === "select") {
				const options = selectionOptions(question);
				for (let i = 0; i < options.length; i++) {
					const option = options[i];
					const selected = i === selectedIndex;
					const prefix = selected ? theme.fg("accent", "> ") : "  ";
					const text = selected ? theme.fg("accent", option.label) : theme.fg("text", option.label);
					lines.push(truncateToWidth(`${prefix}${i + 1}. ${text}`, width));
					if (option.description) addWrapped(lines, theme.fg("muted", option.description), width, 5);
				}
				return;
			}

			const draft = ensureMultiDraft(question);
			for (let i = 0; i < question.options.length; i++) {
				const option = question.options[i];
				const selected = i === selectedIndex;
				const checked = draft.has(option.value) ? "[x]" : "[ ]";
				const prefix = selected ? theme.fg("accent", "> ") : "  ";
				const text = selected ? theme.fg("accent", option.label) : theme.fg("text", option.label);
				lines.push(truncateToWidth(`${prefix}${checked} ${text}`, width));
				if (option.description) addWrapped(lines, theme.fg("muted", option.description), width, 6);
			}
		}

		function renderSummary(lines: string[], width: number) {
			lines.push(theme.fg("accent", theme.bold(" Review answers")));
			lines.push("");
			for (let i = 0; i < config.questions.length; i++) {
				const question = config.questions[i];
				const answer = answers.get(question.id);
				const requiredMissing = question.required && (!answer || answer.skipped);
				const marker = requiredMissing ? theme.fg("warning", "!") : answer?.skipped ? theme.fg("dim", "○") : theme.fg("success", "✓");
				const prefix = i === summaryIndex ? theme.fg("accent", "> ") : "  ";
				const value = answer ? answer.displayValue : "Unanswered";
				const suffix = answer?.source === "default" ? theme.fg("dim", " (default)") : "";
				lines.push(truncateToWidth(`${prefix}${marker} ${question.label}: ${value}${suffix}`, width));
			}
			lines.push("");
			if (allRequiredAnswered()) {
				lines.push(theme.fg("success", " Enter submit • ↑↓ choose question • e edit • Esc cancel"));
			} else {
				lines.push(theme.fg("warning", " Enter requires all required answers • ↑↓ choose • e edit • Esc cancel"));
			}
		}

		function render(width: number): string[] {
			if (cachedLines && cachedWidth === width) return cachedLines;
			const safeWidth = Math.max(1, width);
			const lines: string[] = [];
			const add = (line: string) => lines.push(truncateToWidth(line, safeWidth));

			add(theme.fg("accent", "─".repeat(safeWidth)));
			add(theme.fg("toolTitle", theme.bold(` ${config.title}`)));
			if (config.intro) addWrapped(lines, theme.fg("muted", config.intro), safeWidth, 1);
			add(theme.fg("dim", ` ${currentIndex < config.questions.length ? `Question ${currentIndex + 1}/${config.questions.length}` : "Review"}`));
			add(theme.fg("accent", "─".repeat(safeWidth)));
			lines.push("");

			const question = currentQuestion();
			if (question) renderQuestion(lines, safeWidth, question);
			else renderSummary(lines, safeWidth);

			if (validation) {
				lines.push("");
				addWrapped(lines, theme.fg("warning", validation), safeWidth, 1);
			}

			lines.push("");
			if (question?.type === "multiselect") {
				add(theme.fg("dim", " Space toggle • Enter continue • ↑↓ navigate • Esc cancel"));
			} else if (question?.type === "select" || question?.type === "confirm") {
				add(theme.fg("dim", " Enter choose • ↑↓ navigate • Esc cancel"));
			} else if (question?.type === "multiline") {
				add(theme.fg("dim", " Enter submit • Shift+Enter newline • Esc cancel"));
			} else if (question?.type === "text") {
				add(theme.fg("dim", " Enter submit • Esc cancel"));
			}
			add(theme.fg("accent", "─".repeat(safeWidth)));

			cachedWidth = width;
			cachedLines = lines;
			return lines;
		}

		selectedIndex = initialSelectedIndex(currentQuestion());
		return {
			render,
			invalidate: () => {
				cachedWidth = undefined;
				cachedLines = undefined;
			},
			handleInput,
			dispose: () => signal?.removeEventListener("abort", abort),
		};
	});
}

async function askKeepPartial(ctx: ExtensionContext, count: number): Promise<boolean> {
	if (ctx.hasUI) {
		return ctx.ui.confirm("Keep partial interview answers?", `${count} answer${count === 1 ? "" : "s"} collected before cancellation.`);
	}
	return askPlainConfirm(`Keep ${count} partial answer${count === 1 ? "" : "s"}?`, false);
}

async function finalizeResult(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	result: InterviewResult,
	signal?: AbortSignal,
): Promise<InterviewResult> {
	let finalResult = result;
	if (result.cancelled && result.answers.length > 0) {
		if (signal?.aborted) {
			finalResult = { ...result, answers: [], keptPartial: false, partial: false };
		} else {
			const keep = await askKeepPartial(ctx, result.answers.length);
			finalResult = {
				...result,
				answers: keep ? result.answers : [],
				keptPartial: keep,
				partial: keep,
			};
		}
	}

	const shouldSave = !finalResult.cancelled || finalResult.keptPartial;
	if (shouldSave) {
		finalResult = { ...finalResult, saved: true };
		pi.appendEntry(CUSTOM_TYPE, finalResult);
	}
	return finalResult;
}

async function runInterview(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	params: RawInterviewParams,
	invocation: Invocation,
	signal?: AbortSignal,
): Promise<InterviewResult> {
	const config = normalizeParams(params);
	if (config.questions.length === 0) {
		return resultWith(config, invocation, [], true, { error: "No questions provided" });
	}

	const result = ctx.hasUI
		? await runTuiInterview(config, invocation, ctx, signal)
		: await runPlainInterview(config, invocation, signal);
	return finalizeResult(pi, ctx, result, signal);
}

function canUsePlainPrompt(): boolean {
	return Boolean(stdin.isTTY && stderr.isTTY);
}

async function askPlainConfirm(prompt: string, defaultValue: boolean): Promise<boolean> {
	if (!canUsePlainPrompt()) return false;
	const rl = createInterface({ input: stdin, output: stderr });
	try {
		const suffix = defaultValue ? " [Y/n] " : " [y/N] ";
		const answer = (await rl.question(`${prompt}${suffix}`)).trim().toLowerCase();
		if (!answer) return defaultValue;
		return answer === "y" || answer === "yes";
	} finally {
		rl.close();
	}
}

async function runPlainInterview(config: InterviewConfig, invocation: Invocation, signal?: AbortSignal): Promise<InterviewResult> {
	if (!canUsePlainPrompt()) {
		return resultWith(config, invocation, [], true, {
			error: "UI is unavailable and stdin/stderr are not TTYs, so the interview cannot prompt interactively.",
		});
	}

	const rl = createInterface({ input: stdin, output: stderr });
	const answers: InterviewAnswer[] = [];
	let cancelled = false;

	async function questionLine(prompt: string): Promise<string> {
		if (signal?.aborted) {
			cancelled = true;
			throw new Error("cancelled");
		}
		try {
			const answer = await rl.question(prompt, signal ? { signal } : undefined);
			if (answer.trim() === "/cancel") {
				cancelled = true;
				throw new Error("cancelled");
			}
			return answer;
		} catch (error) {
			if (signal?.aborted) {
				cancelled = true;
				throw new Error("cancelled");
			}
			throw error;
		}
	}

	try {
		stderr.write(`\n${config.title}\n`);
		if (config.intro) stderr.write(`${config.intro}\n`);
		stderr.write("Type /cancel at any prompt to cancel.\n\n");

		for (let i = 0; i < config.questions.length; i++) {
			const question = config.questions[i];
			stderr.write(`[${i + 1}/${config.questions.length}] ${question.prompt}\n`);
			if (question.help) stderr.write(`${question.help}\n`);
			const answer = await askPlainQuestion(questionLine, question);
			answers.push(answer);
			stderr.write("\n");
		}
	} catch (error) {
		if (!cancelled) throw error;
	} finally {
		rl.close();
	}

	return resultWith(config, invocation, answers, cancelled);
}

async function askPlainQuestion(questionLine: (prompt: string) => Promise<string>, question: Question): Promise<InterviewAnswer> {
	if (question.type === "text") return askPlainText(questionLine, question, false);
	if (question.type === "multiline") return askPlainText(questionLine, question, true);
	if (question.type === "confirm") return askPlainConfirmQuestion(questionLine, question);
	if (question.type === "select") return askPlainSelect(questionLine, question);
	return askPlainMultiselect(questionLine, question);
}

async function askPlainText(
	questionLine: (prompt: string) => Promise<string>,
	question: Question,
	multiline: boolean,
): Promise<InterviewAnswer> {
	for (;;) {
		let value = "";
		if (multiline) {
			stderr.write("Enter multiline text. Finish with a single '.' line.\n");
			const lines: string[] = [];
			for (;;) {
				const line = await questionLine("> ");
				if (line === ".") break;
				lines.push(line);
			}
			value = lines.join("\n").trimEnd();
		} else {
			const defaultValue = coerceDefault(question);
			const hint = defaultValue !== undefined ? ` [default: ${displayValue(question, defaultValue)}]` : "";
			value = await questionLine(`${question.label}${hint}: `);
			value = value.trim();
		}

		if (value.length > 0) return makeAnswer(question, value, "user");
		const defaultValue = coerceDefault(question);
		if (defaultValue !== undefined) return makeAnswer(question, defaultValue, "default");
		if (!question.required) return makeSkipped(question);
		stderr.write("Answer required.\n");
	}
}

async function askPlainConfirmQuestion(
	questionLine: (prompt: string) => Promise<string>,
	question: Question,
): Promise<InterviewAnswer> {
	const defaultValue = coerceDefault(question);
	for (;;) {
		const suffix = defaultValue === true ? " [Y/n] " : defaultValue === false ? " [y/N] " : question.required ? " [y/n] " : " [y/n/skip] ";
		const answer = (await questionLine(`${question.label}${suffix}`)).trim().toLowerCase();
		if (!answer && defaultValue !== undefined) return makeAnswer(question, defaultValue, "default");
		if (!answer && !question.required) return makeSkipped(question);
		if (answer === "y" || answer === "yes") return makeAnswer(question, true, "user");
		if (answer === "n" || answer === "no") return makeAnswer(question, false, "user");
		if (answer === "skip" && !question.required) return makeSkipped(question);
		stderr.write("Answer y or n.\n");
	}
}

async function askPlainSelect(
	questionLine: (prompt: string) => Promise<string>,
	question: Question,
): Promise<InterviewAnswer> {
	const options = selectionOptions(question);
	const defaultValue = coerceDefault(question);
	for (;;) {
		for (let i = 0; i < options.length; i++) {
			stderr.write(`${i + 1}. ${options[i].label}\n`);
		}
		const hint = defaultValue !== undefined ? ` [default: ${displayValue(question, defaultValue)}]` : "";
		const answer = (await questionLine(`Choice${hint}: `)).trim();
		if (!answer && defaultValue !== undefined) return makeAnswer(question, defaultValue, "default");
		const index = Number(answer) - 1;
		const option = Number.isInteger(index) ? options[index] : options.find((item) => item.value === answer);
		if (option?.value === "__skip__") return makeSkipped(question);
		if (option) return makeAnswer(question, option.value, "user");
		stderr.write("Choose a listed number or value.\n");
	}
}

async function askPlainMultiselect(
	questionLine: (prompt: string) => Promise<string>,
	question: Question,
): Promise<InterviewAnswer> {
	const defaultValue = coerceDefault(question);
	for (;;) {
		for (let i = 0; i < question.options.length; i++) {
			stderr.write(`${i + 1}. ${question.options[i].label}\n`);
		}
		const hint = Array.isArray(defaultValue) && defaultValue.length > 0 ? ` [default: ${displayValue(question, defaultValue)}]` : "";
		const answer = (await questionLine(`Choices comma-separated${hint}: `)).trim();
		let selected: string[];
		if (!answer && Array.isArray(defaultValue)) selected = defaultValue;
		else if (!answer) selected = [];
		else {
			const invalid: string[] = [];
			selected = answer
				.split(",")
				.map((part) => part.trim())
				.filter(Boolean)
				.flatMap((part) => {
					const index = Number(part) - 1;
					const byIndex = Number.isInteger(index) ? question.options[index] : undefined;
					const byValue = question.options.find((option) => option.value === part || option.label === part);
					const option = byIndex ?? byValue;
					if (!option) {
						invalid.push(part);
						return [];
					}
					return [option.value];
				});
			if (invalid.length > 0) {
				stderr.write(`Unknown choice(s): ${invalid.join(", ")}.\n`);
				continue;
			}
		}
		const minItems = question.minItems ?? (question.required ? 1 : 0);
		const maxItems = question.maxItems ?? Number.POSITIVE_INFINITY;
		if (selected.length < minItems) {
			stderr.write(`Select at least ${minItems}.\n`);
			continue;
		}
		if (selected.length > maxItems) {
			stderr.write(`Select no more than ${maxItems}.\n`);
			continue;
		}
		return selected.length === 0 ? makeSkipped(question) : makeAnswer(question, selected, answer ? "user" : "default");
	}
}

function toolContentForResult(result: InterviewResult): string {
	if (result.error) return `Interview failed: ${result.error}`;
	if (result.cancelled && result.answers.length === 0) return "User cancelled the interview and discarded partial answers.";
	if (result.cancelled) return `User cancelled the interview; kept ${result.answers.length} partial answer(s):\n${summarizeAnswers(result.answers)}`;
	return `Interview complete. Saved: ${result.saved ? "yes" : "no"}.\n${summarizeAnswers(result.answers)}`;
}

function loadLastAssistantText(ctx: ExtensionCommandContext): string | undefined {
	const branch = ctx.sessionManager.getBranch();
	for (let i = branch.length - 1; i >= 0; i--) {
		const entry = branch[i];
		if (entry.type !== "message") continue;
		const message = entry.message;
		if (!("role" in message) || message.role !== "assistant") continue;
		const parts = Array.isArray(message.content)
			? message.content.flatMap((part) => (part.type === "text" ? [part.text] : []))
			: [];
		if (parts.length > 0) return parts.join("\n");
	}
	return undefined;
}

function stripMarkdownQuestion(line: string): string {
	return line
		.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s*)/, "")
		.replace(/`/g, "")
		.replace(/\*\*/g, "")
		.trim();
}

function extractQuestionsFromText(text: string): RawInterviewParams {
	const extracted: Array<{ prompt: string; options: RawOption[] }> = [];
	let current: { prompt: string; options: RawOption[] } | undefined;

	for (const rawLine of text.split(/\r?\n/)) {
		const optionCandidate = rawLine
			.trim()
			.replace(/^\s*[-*+]\s+/, "")
			.replace(/`/g, "")
			.replace(/\*\*/g, "")
			.trim();
		const optionMatch = optionCandidate.match(/^([A-Z]|[a-z]|\d+)[.)]\s+(.+)$/);
		if (current && optionMatch?.[1] && optionMatch[2] && !optionMatch[2].includes("?")) {
			current.options.push({ value: optionMatch[1], label: optionMatch[2].trim() });
			continue;
		}

		const clean = stripMarkdownQuestion(rawLine);
		if (!clean) continue;
		if (clean.includes("?")) {
			current = { prompt: clean, options: [] };
			extracted.push(current);
		}
	}

	return {
		title: "Answer assistant questions",
		intro: "Extracted from the last assistant message.",
		questions: extracted.map((question, index) => ({
			id: `q${index + 1}`,
			label: `Q${index + 1}`,
			type: question.options.length > 0 ? "select" : "text",
			prompt: question.prompt,
			options: question.options.length > 0 ? question.options : undefined,
		})),
	};
}

function parseOptions(text: string | undefined): RawOption[] | undefined {
	if (!text) return undefined;
	const options = text
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean)
		.map((part) => {
			const separator = part.indexOf(":");
			if (separator <= 0) return { value: part, label: part };
			return { value: part.slice(0, separator).trim(), label: part.slice(separator + 1).trim() };
		});
	return options.length > 0 ? options : undefined;
}

function parsePlainQuestions(text: string): RawInterviewParams {
	const questions = text
		.split(/\r?\n/)
		.map((line) => stripMarkdownQuestion(line))
		.filter(Boolean)
		.map((line, index): RawQuestion => {
			const parts = line.split("|").map((part) => part.trim());
			if (parts.length >= 2 && QUESTION_TYPES.includes(parts[0] as QuestionType)) {
				return {
					id: `q${index + 1}`,
					type: parts[0] as QuestionType,
					label: `Q${index + 1}`,
					prompt: parts[1],
					options: parseOptions(parts[2]),
				};
			}
			if (parts.length >= 3 && QUESTION_TYPES.includes(parts[1] as QuestionType)) {
				return {
					id: parts[0] || `q${index + 1}`,
					type: parts[1] as QuestionType,
					label: parts[0] || `Q${index + 1}`,
					prompt: parts[2],
					options: parseOptions(parts[3]),
				};
			}
			return { id: `q${index + 1}`, label: `Q${index + 1}`, type: "text", prompt: line };
		});

	return { title: "Interview", questions };
}

function coerceParsedInterview(value: unknown): RawInterviewParams {
	if (Array.isArray(value)) return { title: "Interview", questions: value as RawQuestion[] };
	if (value && typeof value === "object" && Array.isArray((value as { questions?: unknown }).questions)) {
		return value as RawInterviewParams;
	}
	throw new Error("JSON must be an array of questions or an object with a questions array.");
}

function parseInterviewText(text: string): RawInterviewParams {
	const trimmed = text.trim();
	if (!trimmed) return { title: "Interview", questions: [] };
	if (trimmed.startsWith("{") || trimmed.startsWith("[")) return coerceParsedInterview(JSON.parse(trimmed));
	return parsePlainQuestions(trimmed);
}

function parseCommandInterview(args: string, ctx: ExtensionCommandContext): RawInterviewParams {
	const trimmed = args.trim();
	if (!trimmed) {
		const lastAssistant = loadLastAssistantText(ctx);
		if (!lastAssistant) throw new Error("No command args and no assistant message to extract questions from.");
		return extractQuestionsFromText(lastAssistant);
	}

	const fileArg = trimmed.startsWith("--file ") ? trimmed.slice("--file ".length).trim() : trimmed.startsWith("@") ? trimmed.slice(1) : undefined;
	if (fileArg) {
		const filePath = path.resolve(ctx.cwd, fileArg);
		return parseInterviewText(readFileSync(filePath, "utf8"));
	}

	const possiblePath = path.resolve(ctx.cwd, trimmed);
	if (!trimmed.includes("\n") && existsSync(possiblePath)) {
		return parseInterviewText(readFileSync(possiblePath, "utf8"));
	}

	return parseInterviewText(trimmed);
}

export default function interview(pi: ExtensionAPI) {
	pi.registerTool({
		name: "interview",
		label: "Interview",
		description:
			"Ask the user focused clarification questions in a TUI. Supports text, multiline, confirm, select, and multiselect questions; returns structured keyed answers and persists them to session metadata.",
		promptSnippet: "Ask the user structured clarification questions in a focused TUI interview.",
		promptGuidelines: [
			"Use interview when implementation confidence depends on unresolved user scope, acceptance criteria, or preference questions.",
			"When using interview, provide stable question ids and choose the narrowest useful question type: text, multiline, confirm, select, or multiselect.",
		],
		parameters: InterviewParamsSchema,
		executionMode: "sequential",

		async execute(_toolCallId, params: InterviewParams, signal, _onUpdate, ctx) {
			const result = await runInterview(pi, ctx, params as RawInterviewParams, "tool", signal);
			return {
				content: [{ type: "text", text: toolContentForResult(result) }],
				details: result,
			};
		},

		renderCall(args, theme) {
			const questions = Array.isArray(args.questions) ? args.questions : [];
			const title = typeof args.title === "string" ? args.title : "Interview";
			let text = theme.fg("toolTitle", theme.bold("interview "));
			text += theme.fg("muted", `${title} • ${questions.length} question${questions.length === 1 ? "" : "s"}`);
			return new Text(text, 0, 0);
		},

		renderResult(result, _options, theme) {
			const details = result.details as InterviewResult | undefined;
			if (!details) return new Text(result.content[0]?.type === "text" ? result.content[0].text : "", 0, 0);
			if (details.error) return new Text(theme.fg("error", details.error), 0, 0);
			if (details.cancelled && details.answers.length === 0) return new Text(theme.fg("warning", "Cancelled"), 0, 0);
			const prefix = details.cancelled ? theme.fg("warning", "Partial") : theme.fg("success", "Complete");
			const lines = [prefix + theme.fg("dim", details.saved ? " • saved" : " • not saved")];
			for (const answer of details.answers) {
				const marker = answer.skipped ? theme.fg("dim", "○") : theme.fg("success", "✓");
				const source = answer.source === "default" ? theme.fg("dim", " (default)") : "";
				lines.push(`${marker} ${theme.fg("accent", answer.id)}: ${answer.displayValue}${source}`);
			}
			return new Text(lines.join("\n"), 0, 0);
		},
	});

	pi.registerCommand("interview", {
		description:
			"Answer a TUI interview. Args may be JSON, @file/--file file, simple question lines, or empty to extract questions from the last assistant message.",
		handler: async (args: string, ctx: ExtensionCommandContext) => {
			let parsed: RawInterviewParams;
			try {
				parsed = parseCommandInterview(args, ctx);
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
				return;
			}

			let result: InterviewResult;
			try {
				result = await runInterview(pi, ctx, parsed, "command");
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
				return;
			}
			if (result.error) {
				ctx.ui.notify(result.error, "error");
				return;
			}
			if (result.cancelled && result.answers.length === 0) {
				ctx.ui.notify("Interview cancelled", "info");
				return;
			}
			ctx.ui.notify(
				`Interview ${result.cancelled ? "partially saved" : "saved"}: ${result.answers.length} answer${result.answers.length === 1 ? "" : "s"}`,
				"info",
			);
		},
	});
}
