import { parseSemver } from "@justanarthur/just-github-actions-n-workflows-lib/version/parse-semver"
import { compareSemver } from "@justanarthur/just-github-actions-n-workflows-lib/version/compare-semver"

import pkg from "../package.json" with { type: "json" }
import rootPkg from "../../package.json" with { type: "json" }

const REPO = (pkg.repository as any).url
  .replace(/^https?:\/\/github\.com\//, "")
  .replace(/\.git$/, "")

const API_BASE = `https://api.github.com/repos/${REPO}`
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}`

// --- auth ---
// supports private repos via GH_TOKEN or GITHUB_TOKEN env var.

function authHeaders(): Record<string, string> {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  return headers
}

// --- root package tag prefixes ---
// tags may use the package name (e.g. "@justanarthur/just-github-actions-n-workflows@1.0.0")
// or the repo name (e.g. "just-github-actions-n-workflows@1.0.0").
// we search for both and deduplicate.

const REPO_NAME = REPO.split("/").pop()!
const TAG_PREFIXES = [
  `${rootPkg.name}@`,
  `${REPO_NAME}@`,
]

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
  const results = await Promise.all(
    TAG_PREFIXES.map(async (prefix) => {
      const encoded = encodeURIComponent(prefix)
      const url = `${API_BASE}/git/matching-refs/tags/${encoded}`
      const res = await fetch(url, { headers: authHeaders() })
      if (!res.ok) return []
      const refs: any[] = await res.json()
      return refs.map((r) => {
        const tag = (r.ref as string).replace("refs/tags/", "")
        const version = tag.slice(prefix.length)
        return { tag, version }
      })
    })
  )

  const seen = new Set<string>()
  const deduped = results
    .flat()
    .filter((t) => {
      if (seen.has(t.version)) return false
      seen.add(t.version)
      return true
    })

  return deduped.sort((a, b) => {
    const pa = parseSemver(a.version)
    const pb = parseSemver(b.version)
    if (!pa || !pb) return 0
    return compareSemver(pb, pa)
  })
}

export async function fetchWorkflowList(gitRef: string, log): Promise<WorkflowEntry[]> {
  const url = `${API_BASE}/contents/workflows?ref=${gitRef}`
  const res = await fetch(url, { headers: authHeaders() })

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
  const res = await fetch(url, { headers: authHeaders() })

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

// --- settings template ---

export const SETTINGS_FILENAME = ".justactions.yml"

export async function fetchSettingsTemplate(gitRef: string): Promise<string | null> {
  const url = `${RAW_BASE}/${gitRef}/${SETTINGS_FILENAME}`
  const res = await fetch(url, { headers: authHeaders() })

  if (!res.ok) return null

  return await res.text()
}

