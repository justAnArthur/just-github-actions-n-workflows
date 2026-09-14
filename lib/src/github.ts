import { appendFileSync } from "node:fs"

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

export function setOutput(key: string, value: string): void {
  appendToGithubFile("GITHUB_OUTPUT", "output", key, value)
}

export function setEnv(key: string, value: string): void {
  appendToGithubFile("GITHUB_ENV", "env", key, value)
}

// --- env var helpers ---
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

export const log = {
  info: (msg: string) => console.log(msg),
  debug: (msg: string) => console.log(`::debug::${msg}`),
  warn: (msg: string) => console.log(`::warning::${msg}`),
  error: (msg: string) => console.log(`::error::${msg}`),
  group: (title: string) => console.log(`::group::${title}`),
  groupEnd: () => console.log("::endgroup::")
}
