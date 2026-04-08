// github.ts
// ---
// github actions runtime helpers.
// wraps common patterns: reading env vars, writing step outputs,
// and structured logging that github actions understands.
// ---

import { appendFileSync } from "node:fs";

// --- step outputs ---
// writes a key/value pair to `$GITHUB_OUTPUT` so downstream steps
// can read it via `steps.<id>.outputs.<key>`.
// multiline values are wrapped with a heredoc-style delimiter.

export function setOutput(key: string, value: string): void {
  const outputFile = process.env.GITHUB_OUTPUT;
  if (!outputFile) {
    console.warn(`GITHUB_OUTPUT is not set — cannot write output "${key}"`);
    return;
  }

  if (value.includes("\n")) {
    appendFileSync(outputFile, `${key}<<EOF\n${value}\nEOF\n`);
  } else {
    appendFileSync(outputFile, `${key}=${value}\n`);
  }
}

// --- env var helpers ---
// `getRequiredEnv` throws immediately when a variable is missing,
// giving a clear error message instead of a silent undefined.

export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`required environment variable "${name}" is not set`);
  }
  return value;
}

export function getEnv(name: string, fallback: string = ""): string {
  return process.env[name] ?? fallback;
}

// --- logging ---
// thin wrappers around `console.log` that emit github actions
// workflow commands (::debug::, ::warning::, ::error::, ::group::).

export const log = {
  info: (msg: string) => console.log(msg),
  debug: (msg: string) => console.log(`::debug::${msg}`),
  warn: (msg: string) => console.log(`::warning::${msg}`),
  error: (msg: string) => console.log(`::error::${msg}`),
  group: (title: string) => console.log(`::group::${title}`),
  groupEnd: () => console.log("::endgroup::"),
};
