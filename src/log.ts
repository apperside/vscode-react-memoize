import * as vscode from "vscode";

let channel: vscode.LogOutputChannel | undefined;

export function createLog(): vscode.LogOutputChannel {
  channel ??= vscode.window.createOutputChannel("React Easy Memoize", { log: true });
  return channel;
}

export const log = {
  info: (message: string): void => channel?.info(message),
  debug: (message: string): void => channel?.debug(message),
  warn: (message: string): void => channel?.warn(message),
  error: (message: string, error?: unknown): void =>
    channel?.error(error === undefined ? message : `${message}: ${describe(error)}`),
};

export function describe(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}

/** Short, single-line preview of source text for log lines. */
export function preview(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
