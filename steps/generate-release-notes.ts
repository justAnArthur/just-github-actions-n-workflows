// generate-release-notes.ts
// ---
// step: produce markdown release notes from conventional commits
// between two tags.  groups changes by scope and highlights
// breaking changes.
//
// env:
//   TAG_NAME — the tag to generate notes for (required)
//   ROOT_DIR — repository root for manifest discovery (default: cwd)
//
// outputs:
//   release_notes — markdown body written to `$GITHUB_OUTPUT`
// ---

import { getEnv, getRequiredEnv, log, setOutput } from "./_lib/github"
import { execWithTimeout } from "./_lib/exec"
import { parseCommitMessage } from "./_lib/git/conventional-commit-parser"
import { findManifests } from "./_lib/manifests"
import type { ParsedVersion } from "./_lib/version/parse-semver"
import { parseSemver } from "./_lib/version/parse-semver"

// --- semver comparison ---
// compares two parsed versions for sorting.
// within the same base version, canary > stable in this project's flow.

function compareSemver(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  if (a.patch !== b.patch) return a.patch - b.patch

  if (!a.prerelease && !b.prerelease) return 0
  if (a.prerelease && !b.prerelease) return 1
  if (!a.prerelease && b.prerelease) return -1

  const aParts = a.prerelease!.split(".")
  const bParts = b.prerelease!.split(".")
  const len = Math.max(aParts.length, bParts.length)

  for (let i = 0; i < len; i++) {
    const ap = aParts[i]
    const bp = bParts[i]
    if (ap === undefined) return -1
    if (bp === undefined) return 1

    const aNum = /^\d+$/.test(ap) ? parseInt(ap, 10) : NaN
    const bNum = /^\d+$/.test(bp) ? parseInt(bp, 10) : NaN

    if (!isNaN(aNum) && !isNaN(bNum)) {
      if (aNum !== bNum) return aNum - bNum
    } else {
      const cmp = ap.localeCompare(bp)
      if (cmp !== 0) return cmp
    }
  }

  return 0
}

// --- helpers ---

// extracts the version portion from a tag: `@scope/pkg@1.2.3` → `1.2.3`
function versionFromTag(tag: string): string {
  const lastAt = tag.lastIndexOf("@")
  return lastAt > 0 ? tag.slice(lastAt + 1) : tag
}

// --- core ---

async function generateReleaseNotes(
  tagName: string,
  rootDir: string
): Promise<string> {
  const moduleName = tagName.slice(0, tagName.lastIndexOf("@"))
  const version = versionFromTag(tagName)
  const isCanary = /-(canary|rc|alpha|beta)/.test(version)

  log.info(`module: ${moduleName}, version: ${version} (${isCanary ? "canary" : "stable"})`)

  // --- find previous tag ---

  let previousTag = ""

  try {
    const allTagsOutput = await execWithTimeout(
      `git tag --list '${moduleName}@*' --sort=-creatordate`,
      10_000
    )
    const allTags = allTagsOutput.trim().split("\n").filter(Boolean)
    log.info(`found ${allTags.length} tag(s) for ${moduleName}`)

    // parse and sort tags in descending semver order
    const parsed = allTags
      .map((tag: string) => ({ tag, version: parseSemver(versionFromTag(tag)) }))
      .filter((t): t is { tag: string; version: ParsedVersion } => t.version !== null)
      .sort((a, b) => compareSemver(b.version, a.version))

    const currentIdx = parsed.findIndex((t) => t.tag === tagName)

    if (currentIdx === -1 && parsed.length > 0) {
      // tag not in list yet — pick the latest matching channel
      const candidate = isCanary
        ? parsed.find((t) => t.version.prerelease !== null)
        : parsed.find((t) => t.version.prerelease === null)
      if (candidate) previousTag = candidate.tag
    } else {
      // walk backwards from current to find the previous tag
      for (let i = currentIdx + 1; i < parsed.length; i++) {
        if (isCanary || parsed[i].version.prerelease === null) {
          previousTag = parsed[i].tag
          break
        }
      }
    }

    log.info(`previous tag: ${previousTag || "(none)"}`)
  } catch (err) {
    log.error(`error finding previous tag: ${err}`)
  }

  if (!previousTag) {
    log.info("no previous tag found, returning empty release notes")
    return ""
  }

  // --- collect commits in range ---

  let stdout = ""
  try {
    stdout = await execWithTimeout(
      `git log '${previousTag}'..'${tagName}' --pretty=format:%B -z --no-merges`,
      20_000
    )
  } catch (err) {
    log.error(`error getting commits: ${err}`)
    return ""
  }

  const commits = stdout
    .split("\u0000")
    .filter(Boolean)
    .filter((c) => !c.includes("[skip bump]"))

  log.info(`found ${commits.length} commit(s) in range`)

  // --- group commits by scope ---

  const commitsByScope = new Map<string, Set<string>>()

  for (const commit of commits) {
    const parsed = parseCommitMessage(commit)

    if (parsed.items.length > 0) {
      for (const item of parsed.items) {
        const scope = item.scope || "general"
        if (!commitsByScope.has(scope)) commitsByScope.set(scope, new Set())
        commitsByScope.get(scope)!.add(commit)
      }
    } else if (parsed.header) {
      if (!commitsByScope.has("general")) commitsByScope.set("general", new Set())
      commitsByScope.get("general")!.add(commit)
    }
  }

  if (commitsByScope.size === 0) return ""

  // --- determine relevant scopes for this module ---

  const excludes = new Set(["node_modules", "dist", ".git", ".github"])
  const foundManifests = await findManifests(rootDir, { exclude: excludes })
  const manifest = foundManifests.find((m) => m.name === moduleName)

  const relevantScopes = new Set<string>()

  if (manifest) {
    relevantScopes.add(moduleName)
    manifest.gitCommitScopeRelatedNames?.forEach((s: string) => relevantScopes.add(s))
  } else {
    // no manifest match — include all non-general scopes
    for (const scope of commitsByScope.keys()) {
      if (scope !== "general") relevantScopes.add(scope)
    }
  }

  // --- build markdown body ---

  let body = "\n### Changes\n\n"

  for (const scope of Array.from(relevantScopes).sort()) {
    const scopeCommits = commitsByScope.get(scope)
    if (!scopeCommits || scopeCommits.size === 0) continue

    body += `#### ${scope}\n`
    for (const commit of scopeCommits) {
      const parsed = parseCommitMessage(commit)
      for (const item of parsed.items) {
        if (item.scope === scope || (scope === "general" && !item.scope)) {
          const breaking = item.type.includes("!") ? " ⚠️ BREAKING" : ""
          body += `- **${item.type}**: ${item.subject}${breaking}\n`
        }
      }
    }
    body += "\n"
  }

  // append unscoped / general commits if not already included
  const generalCommits = commitsByScope.get("general")
  if (generalCommits && generalCommits.size > 0 && !relevantScopes.has("general")) {
    body += "#### Other Changes\n"
    for (const commit of generalCommits) {
      const parsed = parseCommitMessage(commit)
      if (parsed.items.length === 0 && parsed.header) {
        body += `- ${parsed.header}\n`
      }
    }
  }

  return body
}

// --- entry point ---

const tagName = getRequiredEnv("TAG_NAME")
const rootDir = getEnv("ROOT_DIR", process.cwd())

const notes = await generateReleaseNotes(tagName, rootDir)
setOutput("release_notes", notes)

log.info("release notes generated")
if (notes) {
  log.group("release notes")
  log.info(notes)
  log.groupEnd()
}
