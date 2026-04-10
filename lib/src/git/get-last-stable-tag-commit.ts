// get-last-stable-tag-commit.ts
// ---
// finds the commit sha of the latest stable (non-prerelease) tag
// for a given scope.  a "stable" tag matches `<scope>@X.Y.Z`
// with no prerelease suffix.
// ---

import { exec } from "../exec"
import { log } from "../github"

export async function getLastStableTagCommit(
  scope: string
): Promise<string> {
  log.debug(`looking for last stable tag for scope: ${scope}`)

  // list tags matching the scope, newest first
  const tagListCmd = `git tag --list '${scope}@*' --sort=-creatordate`
  const tagListOutput = await exec(tagListCmd)

  // filter to stable-only tags: `<scope>@X.Y.Z` (no `-canary` etc.)
  const stablePattern = new RegExp(
    `^${scope.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}@[0-9]+\\.[0-9]+\\.[0-9]+$`
  )

  const tags = tagListOutput
    .split("\n")
    .map((t) => t.trim())
    .filter((t) => stablePattern.test(t))

  const latestTag = tags[0]

  if (!latestTag) {
    log.warn(`no stable tag found for scope: ${scope}`)
    return ""
  }

  log.debug(`latest stable tag: ${latestTag}`)

  // resolve the tag to a commit sha
  const commit = (await exec(`git rev-list -n 1 '${latestTag}'`)).trim()
  log.debug(`commit for ${latestTag}: ${commit}`)

  return commit
}

