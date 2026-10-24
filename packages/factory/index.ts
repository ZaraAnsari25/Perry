// Factory Droid adapter. Runs one Droid turn through @factory/droid-sdk with a
// permission handler that only approves writes to the allowed files.

import { isAbsolute, join, relative } from "node:path";

import {
  AutonomyLevel,
  DroidMessageType,
  ToolConfirmationOutcome,
  ToolConfirmationType,
  createSession,
  type ToolConfirmationDetails,
} from "@factory/droid-sdk/node";

export interface RunDroidInput {
  /** Directory Droid works in. Must be a real path (no symlinks), e.g. via fs.realpathSync. */
  cwd: string;
  prompt: string;
  /** Repo-relative paths (relative to cwd) Droid may create or edit. */
  allowedFiles: readonly string[];
  /** Called for each tool call and error, for progress output. */
  onEvent?: (line: string) => void;
}

export interface RunDroidResult {
  success: boolean;
  subtype: string;
  sessionId: string;
  text: string;
  error?: string;
  /** Requests the permission handler cancelled: file paths, or the tool type. */
  denied: string[];
  durationMs?: number;
  tokenUsage?: { inputTokens: number; outputTokens: number };
}

// Files a confirmation would write, or null if it does anything other than
// edit files (shell commands, MCP tools, ...). A Script bundles several calls.
function writtenPaths(details: ToolConfirmationDetails): string[] | null {
  switch (details.type) {
    case ToolConfirmationType.Edit:
    case ToolConfirmationType.Create:
      return [details.filePath];
    case ToolConfirmationType.ApplyPatch:
      return details.files?.flatMap((f) => (f.moveTo ? [f.filePath, f.moveTo] : [f.filePath])) ?? [details.filePath];
    case ToolConfirmationType.Script: {
      const nested = details.calls.map((c) => writtenPaths(c.confirmation as ToolConfirmationDetails));
      return nested.every((p) => p !== null) ? nested.flat() : null;
    }
    default:
      return null;
  }
}

export async function runDroid({ cwd, prompt, allowedFiles, onEvent }: RunDroidInput): Promise<RunDroidResult> {
  if (!process.env.FACTORY_API_KEY) {
    throw new Error("FACTORY_API_KEY is not set. Add it to the repo-root .env.");
  }
  const allowed = new Set(allowedFiles);
  const toRepoPath = (p: string) => relative(cwd, isAbsolute(p) ? p : join(cwd, p));
  const denied: string[] = [];

  const session = await createSession({
    cwd,
    // Off: every edit, file creation and shell command goes through the handler.
    autonomyLevel: AutonomyLevel.Off,
    permissionHandler({ toolUses }) {
      for (const { details } of toolUses) {
        const paths = writtenPaths(details);
        if (paths === null || !paths.every((p) => allowed.has(toRepoPath(p)))) {
          denied.push(paths ? paths.map(toRepoPath).join(", ") : details.type);
          return ToolConfirmationOutcome.Cancel;
        }
      }
      return ToolConfirmationOutcome.ProceedOnce;
    },
  });

  try {
    for await (const msg of session.stream(prompt)) {
      switch (msg.type) {
        case DroidMessageType.ToolCall:
          onEvent?.(`[tool] ${msg.name}`);
          break;
        case DroidMessageType.Error:
          onEvent?.(`[error] ${msg.message}`);
          break;
        case DroidMessageType.Result:
          return {
            success: msg.success,
            subtype: msg.subtype,
            sessionId: msg.sessionId,
            text: msg.text,
            error: msg.error?.message,
            denied,
            durationMs: msg.durationMs,
            tokenUsage: msg.tokenUsage
              ? { inputTokens: msg.tokenUsage.inputTokens, outputTokens: msg.tokenUsage.outputTokens }
              : undefined,
          };
      }
    }
    return { success: false, subtype: "no_result", sessionId: "", text: "", denied };
  } finally {
    await session.close();
  }
}
