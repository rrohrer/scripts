/**
 * run_as_sudo — execute a system command as root via pkexec.
 *
 * Security model: pkexec cannot receive a password from its caller. It routes
 * authentication to a polkit agent that talks directly to the setuid
 * polkit-agent-helper-1 -> PAM. The password therefore NEVER passes through the
 * omp process or the LLM context. This extension only supplies the *prompt
 * surface*: a dedicated kitty terminal window running `pkttyagent`, registered
 * as the session's polkit agent. The model provides the command; the human
 * types the password in that separate window.
 */
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { spawn, type ChildProcess } from "node:child_process";

const DEFAULT_TIMEOUT_SEC = 120;
const AGENT_READY_MS = 600;

export default function sudoExtension(pi: ExtensionAPI) {
  const z = pi.zod;
  const log = pi.logger;

  // Lazily-spawned polkit prompt window (kitty + pkttyagent). Reused across
  // calls; pkttyagent self-exits when the omp process it tracks dies, and we
  // also kill it on session shutdown.
  let agent: ChildProcess | null = null;
  let agentReady: Promise<void> | null = null;

  /** Ensure a kitty window running pkttyagent is registered for our process. */
  function ensureAgent(): Promise<void> {
    if (agent && !agent.killed && agent.exitCode === null) {
      return agentReady ?? Promise.resolve();
    }
    // pkttyagent --process <omp pid> registers a polkit agent whose subject is
    // this process's session, so pkexec children of omp route their auth here.
    // Run pkttyagent directly under kitty (no shell) — the title tells the user
    // what the window is for.
    const child = spawn(
      "kitty",
      ["--title", "omp sudo — password prompt", "pkttyagent", "--process", String(process.pid)],
      { stdio: "ignore", detached: false },
    );
    child.on("error", (err) => {
      log?.error?.(`run_as_sudo: failed to spawn prompt window: ${String(err)}`);
      if (agent === child) {
        agent = null;
        agentReady = null;
      }
    });
    child.on("exit", () => {
      if (agent === child) {
        agent = null;
        agentReady = null;
      }
    });
    agent = child;
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, AGENT_READY_MS);
    agentReady = promise;
    return promise;
  }

  function killAgent(): void {
    if (agent && agent.exitCode === null) {
      try {
        agent.kill("SIGTERM");
      } catch {
        /* ignore */
      }
    }
    agent = null;
    agentReady = null;
  }

  pi.on("session_shutdown", () => killAgent());

  pi.registerTool({
    name: "run_as_sudo",
    label: "Run as sudo",
    description:
      "Run a system command as root via pkexec. The password is entered by the " +
      "human in a separate prompt window and is never exposed to you. Provide " +
      "either `argv` (executed directly, no shell — preferred, injection-safe) " +
      "or `shellCommand` (run via `sh -c`). Returns the command's stdout, " +
      "stderr, and exit code.",
    loadMode: "essential",
    approval: "exec",
    parameters: z.object({
      argv: z
        .array(z.string())
        .optional()
        .describe(
          "Program and arguments, run directly without a shell. First element is the program. Mutually exclusive with shellCommand.",
        ),
      shellCommand: z
        .string()
        .optional()
        .describe(
          "A shell command string run via `sh -c` as root. Use only when you need pipes/redirection. Mutually exclusive with argv.",
        ),
      cwd: z
        .string()
        .optional()
        .describe("Working directory for the command (defaults to the session cwd)."),
      timeoutSec: z
        .number()
        .optional()
        .describe(`Timeout in seconds before the command is killed (default ${DEFAULT_TIMEOUT_SEC}).`),
      reason: z
        .string()
        .optional()
        .describe("Short human-readable reason for the elevation, shown in logs."),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const hasArgv = Array.isArray(params.argv) && params.argv.length > 0;
      const hasShell = typeof params.shellCommand === "string" && params.shellCommand.length > 0;
      if (hasArgv === hasShell) {
        return errorResult("Provide exactly one of `argv` (non-empty) or `shellCommand`.");
      }
      if (!process.env.WAYLAND_DISPLAY && !process.env.DISPLAY) {
        return errorResult(
          "No graphical display (WAYLAND_DISPLAY/DISPLAY) available to show the " +
            "password prompt window. run_as_sudo requires an interactive desktop session.",
        );
      }

      const timeoutSec =
        typeof params.timeoutSec === "number" && params.timeoutSec > 0
          ? params.timeoutSec
          : DEFAULT_TIMEOUT_SEC;
      const cwd = params.cwd || ctx?.cwd || pi.cwd;

      // pkexec argv. --disable-internal-agent forces auth to route to our
      // external pkttyagent window rather than pkexec grabbing a tty.
      // --keep-cwd preserves the working directory for the elevated command.
      const target = hasArgv
        ? (params.argv as string[])
        : ["sh", "-c", params.shellCommand as string];
      const pkexecArgs = ["--disable-internal-agent", "--keep-cwd", ...target];

      if (params.reason) log?.info?.(`run_as_sudo: ${params.reason}`);

      await ensureAgent();
      onUpdate?.({
        content: [
          { type: "text", text: "Waiting for password in the 'omp sudo' prompt window…" },
        ],
      });

      // Combine the incoming abort signal with a timeout.
      const ac = new AbortController();
      const onAbort = () => ac.abort();
      if (signal) {
        if (signal.aborted) ac.abort();
        else signal.addEventListener("abort", onAbort, { once: true });
      }
      const timer = setTimeout(() => ac.abort(), timeoutSec * 1000);
      const start = Date.now();

      let result: { stdout: string; stderr: string; code: number | null; killed: boolean };
      try {
        result = await pi.exec("pkexec", pkexecArgs, { signal: ac.signal, cwd });
      } catch (err) {
        return errorResult(`Failed to launch pkexec: ${String(err)}`);
      } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener("abort", onAbort);
      }

      const durationMs = Date.now() - start;
      const details = {
        argv: hasArgv ? params.argv : undefined,
        shellCommand: hasShell ? params.shellCommand : undefined,
        cwd,
        exitCode: result.code,
        durationMs,
      };

      if (result.killed) {
        const why = signal?.aborted ? "cancelled" : `timed out after ${timeoutSec}s`;
        return {
          content: [{ type: "text", text: `Command ${why}.` }],
          details: { ...details, outcome: why },
          isError: true,
        };
      }

      // pkexec exits 126 (not authorized) / 127 (dismissed or auth failed)
      // WITHOUT running the target. Detect that vs. the command's own failure.
      const authFailed =
        (result.code === 126 || result.code === 127) &&
        /not authorized|dismiss|authentication|no authentication agent/i.test(result.stderr);
      if (authFailed) {
        return {
          content: [
            { type: "text", text: `Authentication failed or was cancelled.\n${result.stderr.trim()}` },
          ],
          details: { ...details, outcome: "auth_failed" },
          isError: true,
        };
      }

      const parts: string[] = [];
      if (result.stdout) parts.push(result.stdout.replace(/\n$/, ""));
      if (result.stderr) parts.push(`[stderr]\n${result.stderr.replace(/\n$/, "")}`);
      parts.push(`[exit ${result.code}]`);

      return {
        content: [{ type: "text", text: parts.join("\n") }],
        details: { ...details, outcome: result.code === 0 ? "ok" : "nonzero_exit" },
        isError: result.code !== 0,
      };
    },
  });
}

function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}
