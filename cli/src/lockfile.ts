import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export type LockEntry = {
  name: string
  file: string
  ref: string
  installedAt: string
}

export type Lockfile = {
  ref: string
  installedAt: string
  workflows: Record<string, LockEntry>
}

const LOCKFILE_NAME = ".toolkit-lock.json"

export function lockfilePath(): string {
  return join(process.cwd(), ".github", "workflows", LOCKFILE_NAME)
}

export function readLockfile(): Lockfile | null {
  const path = lockfilePath()
  if (!existsSync(path)) return null

  try {
    const raw = readFileSync(path, "utf-8")
    return JSON.parse(raw) as Lockfile
  } catch {
    return null
  }
}

export function writeLockfile(lock: Lockfile): void {
  const path = lockfilePath()
  writeFileSync(path, JSON.stringify(lock, null, 2) + "\n", "utf-8")
}

export function mergeLockfile(
  existing: Lockfile | null,
  ref: string,
  entries: Omit<LockEntry, "ref" | "installedAt">[]
): Lockfile {
  const now = new Date().toISOString()

  const lock: Lockfile = existing ?? {
    ref,
    installedAt: now,
    workflows: {},
  }

  lock.ref = ref
  lock.installedAt = now

  for (const entry of entries) {
    lock.workflows[entry.file] = {
      name: entry.name,
      file: entry.file,
      ref,
      installedAt: now,
    }
  }

  return lock
}

export function injectRefComment(content: string, ref: string, usesRef?: string): string {
  const marker = "# toolkit-ref:"
  const comment = `${marker} ${ref}`

  if (content.includes(marker)) {
    content = content.replace(/^# toolkit-ref:.*$/m, comment)
  } else {
    const lines = content.split("\n")
    const insertIdx = lines.findIndex(
      (l) => l.trim() !== "" && !l.startsWith("#")
    )

    if (insertIdx >= 0) {
      lines.splice(insertIdx, 0, comment)
    } else {
      lines.push(comment)
    }

    content = lines.join("\n")
  }

  const safeRef = usesRef ?? ref
  content = content.replace(
    /(uses:\s+justAnArthur\/just-github-actions-n-workflows\/[^@\s]+)@\S+/g,
    `$1@${safeRef}`
  )

  return content
}

