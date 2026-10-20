import { moduleFromTag, versionFromTag } from "../git/tag-utils"
import { compareSemver } from "../version/compare-semver"
import { parseSemver, type ParsedVersion } from "../version/parse-semver"

// pins every docker module to its newest version on the channel, and the
// released module to the released version. a full map (instead of only the
// released module) keeps concurrent releases of several modules from
// undoing each other on the same target.
export function releaseModuleVersions(
  modules: { name: string; dockerfilePath?: string; deployTargets: string[] }[],
  tags: string[],
  releasedTag: string,
  channel: "stable" | "canary"
): Record<string, string> {
  const newest = new Map<string, { version: string; parsed: ParsedVersion }>()

  for (const tag of tags) {
    const name = moduleFromTag(tag)
    const version = versionFromTag(tag)
    const parsed = parseSemver(version)
    if (!name || !parsed) continue
    if (channel === "stable" && parsed.prerelease) continue
    const current = newest.get(name)
    if (!current || compareSemver(parsed, current.parsed) > 0) newest.set(name, { version, parsed })
  }

  const versions: Record<string, string> = {}
  for (const mod of modules) {
    if (!mod.dockerfilePath && !mod.deployTargets.includes("docker")) continue
    const found = newest.get(mod.name)
    if (found) versions[mod.name] = found.version
  }

  const releasedName = moduleFromTag(releasedTag)
  if (releasedName) versions[releasedName] = versionFromTag(releasedTag)
  return versions
}
