import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

export type TagWorkflow = {
  file: string
  on: Record<string, any>
}

export type DispatchPlan = {
  file: string
  inputs: Record<string, string>
}

export function parseTagList(raw: string): string[] {
  const text = raw.trim()
  if (!text) return []
  if (text.startsWith("[")) {
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed)) throw new Error(`expected a JSON array of tags, got: ${text}`)
    return parsed.map(String).map((t) => t.trim()).filter(Boolean)
  }
  return text.split(/[\n,]/).map((t) => t.trim()).filter(Boolean)
}

// deliberately looser than github's matcher: `*` also crosses `/`, so a tag
// github would have accepted is never filtered out here
export function globToRegExp(pattern: string): RegExp | null {
  let source = ""
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]
    if (ch === "\\" && i + 1 < pattern.length) {
      source += pattern[++i].replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")
    } else if (ch === "*") {
      while (pattern[i + 1] === "*") i++
      source += ".*"
    } else if (ch === "?" || ch === "+") {
      source += ch
    } else if (ch === "[") {
      const end = pattern.indexOf("]", i + 1)
      if (end === -1) {
        source += "\\["
      } else {
        source += pattern.slice(i, end + 1)
        i = end
      }
    } else {
      source += ch.replace(/[.^${}()|\]\\/]/g, "\\$&")
    }
  }
  try {
    return new RegExp(`^${source}$`)
  } catch {
    return null
  }
}

function matches(pattern: string, tag: string): boolean {
  return globToRegExp(pattern)?.test(tag) ?? true
}

function toList(value: unknown): string[] {
  if (value === undefined || value === null) return []
  return (Array.isArray(value) ? value : [value]).map(String)
}

export function normalizeOn(on: unknown): Record<string, any> {
  if (typeof on === "string") return { [on]: null }
  if (Array.isArray(on)) return Object.fromEntries(on.map((e) => [String(e), null]))
  if (on && typeof on === "object") return on as Record<string, any>
  return {}
}

export function runsOnTagPush(on: Record<string, any>, tag: string): boolean {
  if (!("push" in on)) return false
  const push = on.push ?? {}

  const tags = toList(push.tags)
  const tagsIgnore = toList(push["tags-ignore"])

  if (tags.length > 0) {
    let included = false
    for (const pattern of tags) {
      if (pattern.startsWith("!")) {
        if (included && matches(pattern.slice(1), tag)) included = false
      } else if (matches(pattern, tag)) {
        included = true
      }
    }
    return included
  }
  if (tagsIgnore.length > 0) return !tagsIgnore.some((p) => matches(p, tag))

  // an unfiltered `on: push` (typically CI) would also fire on a tag push, but
  // only workflows that opt into tags explicitly are release machinery
  return false
}

export function planDispatch(workflow: TagWorkflow, tag: string): DispatchPlan | null {
  if (!("workflow_dispatch" in workflow.on)) return null
  const declared: Record<string, any> = workflow.on.workflow_dispatch?.inputs ?? {}

  const unsatisfied = Object.entries(declared).filter(
    ([name, spec]) => name !== "tag" && spec?.required === true && spec?.default === undefined
  )
  if (unsatisfied.length > 0) return null

  return { file: workflow.file, inputs: "tag" in declared ? { tag } : {} }
}

export async function loadWorkflows(dir: string): Promise<TagWorkflow[]> {
  let entries: string[]
  try {
    entries = await readdir(dir)
  } catch {
    return []
  }

  const workflows: TagWorkflow[] = []
  for (const file of entries.filter((f) => /\.ya?ml$/.test(f)).sort()) {
    try {
      const doc = Bun.YAML.parse(await readFile(join(dir, file), "utf8")) as any
      workflows.push({ file, on: normalizeOn(doc?.on ?? doc?.true) })
    } catch {
      // an unparseable file can't be a running workflow either
    }
  }
  return workflows
}

export async function dispatchWorkflow(opts: {
  apiUrl: string
  repository: string
  token: string
  file: string
  ref: string
  inputs: Record<string, string>
}): Promise<void> {
  const url = `${opts.apiUrl}/repos/${opts.repository}/actions/workflows/${encodeURIComponent(opts.file)}/dispatches`
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${opts.token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({ ref: opts.ref, inputs: opts.inputs })
  })

  if (!response.ok) {
    throw new Error(`dispatch of ${opts.file} @ ${opts.ref} failed: ${response.status} ${await response.text()}`)
  }
}
