import pkg from "../package.json" with { type: "json" }
import rootPkg from "../../package.json" with { type: "json" }

const REPO = (pkg.repository as any).url
  .replace(/^https?:\/\/github\.com\//, "")
  .replace(/\.git$/, "")

const API_BASE = `https://api.github.com/repos/${REPO}`
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}`

// --- root package tag prefix ---
// tags for the root toolkit package follow `<root-name>@<version>`.
// the CLI only shows these tags as version choices since workflows are part of the root package.

const TAG_PREFIX = `${rootPkg.name}@`

export { REPO }

// --- types ---

export type VersionTag = {
  tag: string
  version: string
}

export type WorkflowEntry = {
  name: string
  file: string
  description?: string
  secrets?: string[]
}

// --- parse workflow header ---
// extracts description and required secrets from the yaml header comment block.

export function parseWorkflowHeader(content: string): { description: string; secrets: string[] } {
  const lines = content.split("\n")
  let description = ""
  const secrets: string[] = []
  let inHeader = false

  for (const line of lines) {
    if (line.startsWith("# ---")) {
      if (inHeader) break
      inHeader = true
      continue
    }
    if (!inHeader) continue
    if (!line.startsWith("#")) break

    const text = line.replace(/^#\s?/, "").trim()

    if (/^required secrets:/i.test(text)) continue
    if (/^\w+\s+[—–]/.test(text)) {
      secrets.push(text)
      continue
    }

    if (!description && text && !/^copy this|^can also|^actions used|^paste this|^this one/i.test(text)) {
      description = text
    }
  }

  return { description, secrets }
}

// --- api ---

export async function fetchTags(): Promise<VersionTag[]> {
  const url = `${API_BASE}/tags?per_page=100`
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.github.v3+json" }
  })
  if (!res.ok) return []
  const tags: any[] = await res.json()
  return tags
    .map((t) => t.name as string)
    .filter((name) => name.startsWith(TAG_PREFIX))
    .map((name) => ({
      tag: name,
      version: name.slice(TAG_PREFIX.length),
    }))
}

export async function fetchWorkflowList(gitRef: string): Promise<WorkflowEntry[]> {
  const url = `${API_BASE}/contents/workflows?ref=${gitRef}`
  const res = await fetch(url, {
    headers: { Accept: "application/vnd.github.v3+json" }
  })

  if (!res.ok) {
    throw new Error(`failed to list workflows from ${REPO} @ ${gitRef} (${res.status})`)
  }

  const entries: any[] = await res.json()

  return entries
    .filter((e) => e.type === "file" && e.name.endsWith(".yml"))
    .map((e) => ({
      name: e.name.replace(/\.yml$/, ""),
      file: e.name
    }))
}

export async function fetchWorkflowContent(file: string, gitRef: string): Promise<string> {
  const url = `${RAW_BASE}/${gitRef}/workflows/${file}`
  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(`failed to fetch workflows/${file} from ${REPO} @ ${gitRef} (${res.status})`)
  }

  return await res.text()
}

export async function enrichWorkflows(workflows: WorkflowEntry[], gitRef: string): Promise<WorkflowEntry[]> {
  const enriched: WorkflowEntry[] = []

  for (const wf of workflows) {
    try {
      const content = await fetchWorkflowContent(wf.file, gitRef)
      const { description, secrets } = parseWorkflowHeader(content)
      enriched.push({ ...wf, description, secrets })
    } catch {
      enriched.push(wf)
    }
  }

  return enriched
}

