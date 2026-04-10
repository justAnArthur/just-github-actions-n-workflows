// github.ts
// ---
// github actions runtime helpers.
// wraps common patterns: reading env vars, writing step outputs,
// and structured logging that github actions understands.
// ---

import { appendFileSync } from "node:fs"

// --- file-append helper ---
// shared logic for writing key/value pairs to github actions files
// ($GITHUB_OUTPUT, $GITHUB_ENV). multiline values use heredoc delimiters.

function appendToGithubFile(envVar: string, label: string, key: string, value: string): void {
  const filePath = process.env[envVar]
  if (!filePath) {
    console.warn(`${envVar} is not set — cannot write ${label} "${key}"`)
    return
  }

  if (value.includes("\n")) {
    appendFileSync(filePath, `${key}<<EOF\n${value}\nEOF\n`)
  } else {
    appendFileSync(filePath, `${key}=${value}\n`)
  }
}

// --- step outputs ---
// writes a key/value pair to `$GITHUB_OUTPUT` so downstream steps
// can read it via `steps.<id>.outputs.<key>`.

export function setOutput(key: string, value: string): void {
  appendToGithubFile("GITHUB_OUTPUT", "output", key, value)
}

// --- env export ---
// writes a key/value pair to `$GITHUB_ENV` so subsequent steps
// can read it as an environment variable.

export function setEnv(key: string, value: string): void {
  appendToGithubFile("GITHUB_ENV", "env", key, value)
}

// --- env var helpers ---
// `getRequiredEnv` throws immediately when a variable is missing,
// giving a clear error message instead of a silent undefined.

export function getRequiredEnv(name: string): string {
  const value = process.env[name]
  if (value === undefined || value === "") {
    throw new Error(`required environment variable "${name}" is not set`)
  }
  return value
}

export function getEnv(name: string, fallback: string = ""): string {
  return process.env[name] ?? fallback
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
  groupEnd: () => console.log("::endgroup::")
}

