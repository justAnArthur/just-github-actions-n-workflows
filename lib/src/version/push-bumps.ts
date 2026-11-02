import { parseCommitMessage } from "../git/conventional-commit-parser"
import { log } from "../github"
import type { Manifest } from "../manifests"
import { findManifestsByScope } from "../manifests"
import { CONVENTIONAL_TO_SEMVER } from "./calculate-semver"

// highest bump level per manifest named by a scope in the pushed commits.
// a manifest without a version (docs deployed elsewhere, never released)
// is reported in `unversioned` instead of bumped.

export function collectPushBumps<M extends Manifest>(
  commitMessages: string[],
  manifests: M[]
): { bumps: Map<M, number>; unversioned: M[] } {
  const bumps = new Map<M, number>()
  const unversioned = new Set<M>()
  // an unversioned manifest never takes a scope from a versioned one it shares a tier with
  const versioned = manifests.filter((m) => m.version)
  const nonVersioned = manifests.filter((m) => !m.version)

  const items = commitMessages.map(parseCommitMessage).flatMap((c) => c.items)

  for (const item of items) {
    const level = CONVENTIONAL_TO_SEMVER[item.type]
    if (level === undefined) continue

    if (item.scopes.length === 0) {
      log.debug(`skipping commit item with no scope: ${item.raw}`)
      continue
    }

    for (const scope of item.scopes) {
      const named = findManifestsByScope(versioned, scope)
      for (const manifest of named) {
        if ((bumps.get(manifest) ?? -1) < level) bumps.set(manifest, level)
      }
      if (named.length > 0) continue

      const skipped = findManifestsByScope(nonVersioned, scope)
      for (const manifest of skipped) unversioned.add(manifest)
      if (skipped.length === 0) log.debug(`skipping commit item with unknown scope: ${scope}`)
    }
  }

  return { bumps, unversioned: [...unversioned] }
}
