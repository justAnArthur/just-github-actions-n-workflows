// get-commits-from-the-last-stable.ts
// ---
// returns all commit messages between the latest stable tag and HEAD
// for a given manifest.  checks the manifest's primary name and any
// related scope aliases to find the last stable tag.
// ---

import type { Manifest } from "../manifests"
import { exec } from "../exec"
import { log } from "../github"
import { getLastStableTagCommit } from "./get-last-stable-tag-commit"

export async function getCommitsFromTheLastStable(
  manifest: Manifest
): Promise<string[]> {
  let lastStableCommit = ""

  // try the primary name first, then fall back to related scope names
  const scopes = [manifest.name, ...(manifest.gitCommitScopeRelatedNames || [])]

  for (const scope of scopes) {
    log.debug(`checking scope for stable tag: ${scope}`)
    lastStableCommit = await getLastStableTagCommit(scope)
    if (lastStableCommit) break
  }

  if (!lastStableCommit) {
    log.warn(`no stable tag found for manifest: ${manifest.name}`)
  }

  // null-delimited log to safely handle multiline commit messages
  const range = `${lastStableCommit}..HEAD`
  const stdout = await exec(`git log ${range} --pretty=format:%B -z`)

  const commits = stdout.split("\u0000").filter(Boolean)
  log.debug(`found ${commits.length} commit(s) since last stable for ${manifest.name}`)

  return commits
}

