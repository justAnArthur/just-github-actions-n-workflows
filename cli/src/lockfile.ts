import {
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
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

export const AGENTS_FILE = "AGENTS.md"
export const AGENTS_REL_PATH = ".github/AGENTS.md"

export type AgentsLinkResult = "created" | "unchanged" | "skipped-exists" | "failed"

export function ensureAgentsLink(cwd: string, opts: { force: boolean }): AgentsLinkResult {
  const root = join(cwd, AGENTS_FILE)
  const exists = existsSync(root) || lstatExists(root)

  if (exists) {
    const stat = lstatSync(root)
    if (stat.isSymbolicLink()) {
      let target: string | null = null
      try {
        target = readlinkSync(root)
      } catch {
        // dangling or unreadable link — fall through to replacement
      }
      if (target === AGENTS_REL_PATH) {
        return "unchanged"
      }
      try {
        unlinkSync(root)
      } catch {
        return "failed"
      }
    } else if (opts.force) {
      try {
        unlinkSync(root)
      } catch {
        return "failed"
      }
    } else {
      return "skipped-exists"
    }
  }

  try {
    symlinkSync(AGENTS_REL_PATH, root)
    return "created"
  } catch {
    return "failed"
  }
}

function lstatExists(p: string): boolean {
  try {
    lstatSync(p)
    return true
  } catch {
    return false
  }
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

