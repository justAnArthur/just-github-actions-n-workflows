import { getEnv, getRequiredEnv, log, setOutput } from "@justanarthur/just-github-actions-n-workflows-lib/github"
import { execWithTimeout } from "@justanarthur/just-github-actions-n-workflows-lib/exec"
import { parseCommitMessage } from "@justanarthur/just-github-actions-n-workflows-lib/git/conventional-commit-parser"
import { isPrerelease, moduleFromTag, versionFromTag } from "@justanarthur/just-github-actions-n-workflows-lib/git/tag-utils"
import { compareSemver } from "@justanarthur/just-github-actions-n-workflows-lib/version/compare-semver"
import { findManifests } from "@justanarthur/step-bump-manifest-versions/manifests"
import type { ParsedVersion } from "@justanarthur/just-github-actions-n-workflows-lib/version/parse-semver"
import { parseSemver } from "@justanarthur/just-github-actions-n-workflows-lib/version/parse-semver"

// --- core ---

async function generateReleaseNotes(
  tagName: string,
  rootDir: string
): Promise<string> {
  const moduleName = moduleFromTag(tagName)
  const version = versionFromTag(tagName)
  const isCanary = isPrerelease(version)

  log.info(`module: ${moduleName}, version: ${version} (${isCanary ? "prerelease" : "stable"})`)

  let previousTag = ""

  try {
    const allTagsOutput = await execWithTimeout(
      `git tag --list '${moduleName}@*' --sort=-creatordate`,
      10_000
    )
    const allTags = allTagsOutput.trim().split("\n").filter(Boolean)
    log.info(`found ${allTags.length} tag(s) for ${moduleName}`)

    const parsed = allTags
      .map((tag: string) => ({ tag, version: parseSemver(versionFromTag(tag)) }))
      .filter((t): t is { tag: string; version: ParsedVersion } => t.version !== null)
      .sort((a, b) => compareSemver(b.version, a.version))

    const currentIdx = parsed.findIndex((t) => t.tag === tagName)

    if (currentIdx === -1 && parsed.length > 0) {
      const candidate = isCanary
        ? parsed.find((t) => t.version.prerelease !== null)
        : parsed.find((t) => t.version.prerelease === null)
      if (candidate) previousTag = candidate.tag
    } else {
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

  const excludes = new Set(["node_modules", "dist", ".git", ".github"])
  const foundManifests = await findManifests(rootDir, { exclude: excludes })
  const manifest = foundManifests.find((m) => m.name === moduleName)

  const relevantScopes = new Set<string>()

  if (manifest) {
    relevantScopes.add(moduleName)
    manifest.gitCommitScopeRelatedNames?.forEach((s: string) => relevantScopes.add(s))
  } else {
    for (const scope of commitsByScope.keys()) {
      if (scope !== "general") relevantScopes.add(scope)
    }
  }

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

log.group("generate-release-notes")
log.info(`tag: ${tagName}`)
log.info(`root: ${rootDir}`)

const notes = await generateReleaseNotes(tagName, rootDir)
setOutput("release_notes", notes)

log.info("release notes generated")
if (notes) {
  log.group("release notes preview")
  log.info(notes)
  log.groupEnd()
} else {
  log.info("(empty — no notes to output)")
}

log.groupEnd()

