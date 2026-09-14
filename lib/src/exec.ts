import { $ } from "bun"

export async function exec(command: string): Promise<string> {
  const result = await $`bash -c ${command}`.quiet()
  return result.text()
}

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
