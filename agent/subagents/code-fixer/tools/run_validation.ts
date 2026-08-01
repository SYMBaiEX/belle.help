import { defineTool } from "eve/tools";
import { z } from "zod";

const MAX_COMMANDS = 6;
const DEFAULT_TIMEOUT_SEC = 600;
const MAX_OUTPUT_CHARS = 2000;

/**
 * Basic defense-in-depth guard, not a security boundary: the sandbox's own
 * network policy (../sandbox/sandbox.ts) is what actually constrains
 * egress. This just stops the common, obvious ways a validation command
 * could exfiltrate data or linger in the background.
 */
function disallowedReason(command: string): string | null {
  if (/\bcurl\b/.test(command)) return "curl is not allowed in validation commands";
  if (/\bwget\b/.test(command)) return "wget is not allowed in validation commands";
  if (/(^|[^\w])nc\s/.test(command)) return "nc is not allowed in validation commands";
  // A bare `&` not part of `&&` backgrounds the command at the top level.
  if (/(^|[^&])&(?!&)/.test(command)) {
    return "top-level backgrounding (&) is not allowed in validation commands";
  }
  return null;
}

export default defineTool({
  description:
    "Run up to 6 validation commands (format, lint, typecheck, test, build — whatever the repo has) inside the checked-out repo. Each runs as `cd repo && <command>`. Returns exit code and truncated output per command.",
  inputSchema: z.object({
    commands: z.array(z.string().min(1)).min(1).max(MAX_COMMANDS),
    timeoutSecPerCommand: z.number().int().positive().max(3600).optional(),
  }),
  async execute({ commands, timeoutSecPerCommand }, ctx) {
    const sandbox = await ctx.getSandbox();
    const timeoutSec = timeoutSecPerCommand ?? DEFAULT_TIMEOUT_SEC;

    const results: Array<{
      command: string;
      exitCode: number | null;
      stdout: string;
      stderr: string;
      skippedReason?: string;
    }> = [];

    for (const command of commands) {
      const reason = disallowedReason(command);
      if (reason) {
        results.push({ command, exitCode: null, stdout: "", stderr: "", skippedReason: reason });
        continue;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);
      try {
        const result = await sandbox.run({
          command: `cd repo && ${command}`,
          abortSignal: controller.signal,
        });
        results.push({
          command,
          exitCode: result.exitCode,
          stdout: result.stdout.slice(-MAX_OUTPUT_CHARS),
          stderr: result.stderr.slice(-MAX_OUTPUT_CHARS),
        });
      } catch (error) {
        results.push({
          command,
          exitCode: null,
          stdout: "",
          stderr: error instanceof Error ? error.message : String(error),
        });
      } finally {
        clearTimeout(timer);
      }
    }

    return { results };
  },
});
