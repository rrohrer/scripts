import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const RUNNING_STYLE = "bg=red,fg=white,bold";

// Use a local format without embedded #[fg=...] fragments so the red/white
// style also holds when the window is inactive, last-active, or alerting.
const RUNNING_FORMAT = "#[bg=red,fg=white,bold] #I #W #F #[default]";

const OPTIONS = [
	"window-status-style",
	"window-status-current-style",
	"window-status-last-style",
	"window-status-activity-style",
	"window-status-bell-style",
	"window-status-format",
	"window-status-current-format",
] as const;

type TmuxOption = (typeof OPTIONS)[number];

interface SavedOption {
	name: TmuxOption;
	hadLocalValue: boolean;
	value: string;
}

function withoutFinalNewline(value: string): string {
	return value.replace(/\r?\n$/, "");
}

export default function (pi: ExtensionAPI) {
	let targetWindow: string | undefined;
	let savedOptions: SavedOption[] = [];
	let active = false;

	async function tmux(args: string[]): Promise<string> {
		const result = await pi.exec("tmux", args);
		if (result.code !== 0) {
			const stderr = result.stderr.trim();
			throw new Error(`tmux ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
		}
		return withoutFinalNewline(result.stdout);
	}

	async function currentTmuxWindow(): Promise<string | undefined> {
		const pane = process.env.TMUX_PANE;
		if (!process.env.TMUX || !pane) return undefined;

		const windowId = (await tmux(["display-message", "-p", "-t", pane, "#{window_id}"])).trim();
		return windowId.length > 0 ? windowId : undefined;
	}

	async function readLocalOption(windowId: string, option: TmuxOption): Promise<SavedOption> {
		const listing = await tmux(["show-options", "-w", "-t", windowId, option]);
		if (listing.length === 0) {
			return { name: option, hadLocalValue: false, value: "" };
		}

		const value = await tmux(["show-options", "-wqv", "-t", windowId, option]);
		return { name: option, hadLocalValue: true, value };
	}

	async function setOption(windowId: string, option: TmuxOption, value: string): Promise<void> {
		await tmux(["set-option", "-wq", "-t", windowId, option, value]);
	}

	async function unsetOption(windowId: string, option: TmuxOption): Promise<void> {
		await tmux(["set-option", "-wqu", "-t", windowId, option]);
	}

	async function setRunningColor(): Promise<void> {
		if (active) return;

		const windowId = await currentTmuxWindow();
		if (!windowId) return;

		const previousOptions: SavedOption[] = [];
		for (const option of OPTIONS) {
			previousOptions.push(await readLocalOption(windowId, option));
		}

		targetWindow = windowId;
		savedOptions = previousOptions;

		try {
			await setOption(windowId, "window-status-style", RUNNING_STYLE);
			await setOption(windowId, "window-status-current-style", RUNNING_STYLE);
			await setOption(windowId, "window-status-last-style", RUNNING_STYLE);
			await setOption(windowId, "window-status-activity-style", RUNNING_STYLE);
			await setOption(windowId, "window-status-bell-style", RUNNING_STYLE);
			await setOption(windowId, "window-status-format", RUNNING_FORMAT);
			await setOption(windowId, "window-status-current-format", RUNNING_FORMAT);
			active = true;
		} catch (error) {
			await restoreColor().catch(() => undefined);
			throw error;
		}
	}

	async function restoreColor(): Promise<void> {
		const windowId = targetWindow;
		if (!windowId) return;

		for (const option of savedOptions) {
			if (option.hadLocalValue) {
				await setOption(windowId, option.name, option.value);
			} else {
				await unsetOption(windowId, option.name);
			}
		}

		targetWindow = undefined;
		savedOptions = [];
		active = false;
	}

	pi.on("agent_start", setRunningColor);
	pi.on("agent_end", restoreColor);
	pi.on("session_shutdown", restoreColor);
}
