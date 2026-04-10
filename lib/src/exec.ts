// exec.ts
// ---
// shell execution utilities built on bun's built-in shell.
// provides a simple `exec()` wrapper and a timeout-guarded variant
// for use throughout step scripts.
// ---

import { $ } from "bun"

// --- exec ---
// runs a shell command via `bash -c` and returns stdout as a string.
// replaces the old `util.promisify(child_process.exec)` pattern.

export async function exec(command: string): Promise<string> {
  const result = await $`bash -c ${command}`.quiet()
  return result.text()
}

// --- exec with timeout ---
// same as `exec` but rejects if the command exceeds `timeoutMs`.
// useful for git operations that may hang on network issues.

export async function execWithTimeout(
  command: string,
  timeoutMs: number = 30_000
): Promise<string> {
  const timeout = new Promise<string>((_, reject) =>
    setTimeout(
      () => reject(new Error(`command timed out after ${timeoutMs}ms: ${command}`)),
      timeoutMs
    )
  )

  return Promise.race([exec(command), timeout])
}

