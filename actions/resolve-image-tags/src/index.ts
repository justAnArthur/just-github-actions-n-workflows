import { getEnv, getRequiredEnv, log, setEnv } from "@justanarthur/actions-lib/github"
import { execWithTimeout } from "@justanarthur/actions-lib/exec"
import { versionFromTag } from "@justanarthur/actions-lib/git/tag-utils"

interface Component {
  name: string
  package: string
  version: string
}

interface ParsedTag {
  raw: string
  major: number
  minor: number
  patch: number
  preLabel: string
  preNum: number
}

async function fetchRemoteTags(repoUrl: string, token: string): Promise<string[]> {
  let tagsRaw = ""

  if (token) {
    const authedUrl = repoUrl.replace(
      "https://github.com/",
      `https://x-access-token:${token}@github.com/`
    )
    try {
      tagsRaw = await execWithTimeout(`git ls-remote --tags --refs "${authedUrl}"`, 15_000)
    } catch {
      log.warn("authenticated tag fetch failed, falling back to public")
    }
  }

  if (!tagsRaw) {
    try {
      tagsRaw = await execWithTimeout(`git ls-remote --tags --refs "${repoUrl}"`, 15_000)
    } catch {
      log.error(`failed to fetch tags from ${repoUrl}`)
      return []
    }
  }

  return tagsRaw
    .split("\n")
    .map((line) => line.replace(/^.*refs\/tags\//, "").replace(/\^{}$/, ""))
    .filter(Boolean)
}

function parseTagVersion(tag: string): ParsedTag | null {
  const parts = tag.split("@")
  const versionStr = parts[parts.length - 1]
  if (!versionStr) return null

  const clean = versionStr.replace(/^[vV]/, "")
  const [core, pre = ""] = clean.split("-", 2)
  const [majStr, minStr, patStr] = core.split(".")

  const major = parseInt(majStr ?? "0", 10)
  const minor = parseInt(minStr ?? "0", 10)
  const patch = parseInt(patStr ?? "0", 10)
  if (isNaN(major) || isNaN(minor) || isNaN(patch)) return null

  let preLabel = "zzzz"
  let preNum = 0
  if (pre) {
    const preParts = pre.split(".")
    preLabel = preParts[0]
    preNum = parseInt(preParts[1] ?? "0", 10) || 0
  }

  return { raw: tag, major, minor, patch, preLabel, preNum }
}

function sortKey(t: ParsedTag): string {
  return [
    String(t.major).padStart(5, "0"),
    String(t.minor).padStart(5, "0"),
    String(t.patch).padStart(5, "0"),
    t.preLabel,
    String(t.preNum).padStart(5, "0")
  ].join(".")
}

function resolveLatestTag(
  allTags: string[],
  packageName: string,
  mode: "stable" | "canary"
): string {
  const nameNoAt = packageName.replace(/^@/, "")
  const nameDash = nameNoAt.replace(/\//g, "-")

  let candidates = allTags.filter(
    (t) => t.toLowerCase().includes(nameNoAt.toLowerCase()) ||
      t.toLowerCase().includes(nameDash.toLowerCase())
  )
  if (candidates.length === 0) candidates = allTags

  if (mode === "stable") {
    const filtered = candidates.filter((t) => !/canary/i.test(t))
    if (filtered.length > 0) candidates = filtered
  } else {
    const filtered = candidates.filter((t) => /canary/i.test(t))
    if (filtered.length > 0) candidates = filtered
  }

  const parsed = candidates
    .map(parseTagVersion)
    .filter((t): t is ParsedTag => t !== null)
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)))

  return parsed[0]?.raw ?? ""
}

// --- entry point ---

const repoUrl = getRequiredEnv("RESOLVE_REPO_URL")
const componentsRaw = getRequiredEnv("RESOLVE_COMPONENTS")
const token = getEnv("GH_TOKEN", "")

log.group("resolve-docker-image-tags")

let components: Component[]
try {
  components = JSON.parse(componentsRaw)
} catch (err) {
  log.error(`failed to parse RESOLVE_COMPONENTS: ${err}`)
  process.exit(1)
}

log.info(`components to resolve: ${components.map((c) => c.name).join(", ")}`)
log.info(`fetching tags from ${repoUrl}...`)
const allTags = await fetchRemoteTags(repoUrl, token)
log.info(`found ${allTags.length} remote tag(s)`)

if (allTags.length === 0) {
  log.error("no tags found — cannot resolve versions")
  process.exit(1)
}

for (const comp of components) {
  const envKey = `DOCKER_${comp.name.toUpperCase()}_IMAGE_TAG`

  let resolvedTag: string

  switch (comp.version) {
    case "stable":
      resolvedTag = resolveLatestTag(allTags, comp.package, "stable")
      break
    case "canary":
      resolvedTag = resolveLatestTag(allTags, comp.package, "canary")
      break
    default:
      resolvedTag = comp.version
      break
  }

  const version = versionFromTag(resolvedTag)

  if (!version) {
    log.error(`could not resolve version for ${comp.name} (package: ${comp.package}, input: ${comp.version})`)
    process.exit(1)
  }

  setEnv(envKey, version)
  log.info(`${comp.name}: ${comp.version} → ${version}`)
}

log.info("all image tags resolved")
log.groupEnd()

