import { parseCommitMessage } from "../git/conventional-commit-parser"
import { log } from "../github"
import type { Manifest } from "../manifests"
import { findManifestByName } from "../manifests"
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

  const items = commitMessages.map(parseCommitMessage).flatMap((c) => c.items)

  for (const item of items) {
    const level = CONVENTIONAL_TO_SEMVER[item.type]
    if (level === undefined) continue

    if (item.scopes.length === 0) {
      log.debug(`skipping commit item with no scope: ${item.raw}`)
      continue
    }

    for (const scope of item.scopes) {
      const manifest = findManifestByName(manifests, scope) as M | undefined
      if (!manifest) {
        log.debug(`skipping commit item with unknown scope: ${scope}`)
        continue
      }

      if (!manifest.version) {
        unversioned.add(manifest)
        continue
      }

      if ((bumps.get(manifest) ?? -1) < level) bumps.set(manifest, level)
    }
  }

  return { bumps, unversioned: [...unversioned] }
}
