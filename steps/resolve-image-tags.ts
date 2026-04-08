// resolve-image-tags.ts
// ---
// step: resolve docker image tags from git remote tags.
// accepts version inputs like "stable", "canary", or an exact
// version string.  when "stable" or "canary" is given, fetches
// all tags from the remote repo and picks the latest matching one.
//
// env:
//   RESOLVE_REPO_URL   — git remote url to fetch tags from (required)
//   RESOLVE_COMPONENTS — json array of component descriptors (required)
//                        format: [{ "name": "...", "package": "...", "version": "..." }]
//                        e.g. [{ "name": "BACKEND", "package": "@camasys/backend_core", "version": "stable" }]
//   GH_TOKEN           — github token for private repo access (optional)
//
// exports to $GITHUB_ENV:
//   DOCKER_<NAME>_IMAGE_TAG — resolved version for each component
// ---

import { getEnv, getRequiredEnv, log, setEnv } from "./_lib/github"
import { execWithTimeout } from "./_lib/exec"
import { versionFromTag } from "./_lib/git/tag-utils"

// --- types ---

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

// --- tag resolution ---

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
  // extract version from tag like `@scope/pkg@1.2.3-canary.4`
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

  let preLabel = "zzzz" // sorts after all real labels (so stable > prerelease)
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
    String(t.preNum).padStart(5, "0"),
  ].join(".")
}

function resolveLatestTag(
  allTags: string[],
  packageName: string,
  mode: "stable" | "canary"
): string {
  // normalise package name for matching
  const nameNoAt = packageName.replace(/^@/, "")
  const nameDash = nameNoAt.replace(/\//g, "-")

  // filter tags matching this package
  let candidates = allTags.filter(
    (t) => t.toLowerCase().includes(nameNoAt.toLowerCase()) ||
           t.toLowerCase().includes(nameDash.toLowerCase())
  )
  if (candidates.length === 0) candidates = allTags

  // filter by channel
  if (mode === "stable") {
    const filtered = candidates.filter((t) => !/canary/i.test(t))
    if (filtered.length > 0) candidates = filtered
  } else {
    const filtered = candidates.filter((t) => /canary/i.test(t))
    if (filtered.length > 0) candidates = filtered
  }

  // parse and sort, pick highest
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

log.group("resolve-image-tags")

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
      // exact version passed — use as-is
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

