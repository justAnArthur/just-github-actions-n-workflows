import { moduleFromTag, versionFromTag } from "../git/tag-utils"
import { detectChannel } from "./calculate-semver"
import { compareSemver } from "./compare-semver"
import { parseSemver, type ParsedVersion } from "./parse-semver"

export type ResolveMode = "stable" | "canary"

function matchesMode(version: ParsedVersion, mode: ResolveMode): boolean {
  if (mode === "stable") return !version.prerelease
  return detectChannel(version.prerelease)?.toLowerCase() === "canary"
}

// newest tag of the package for the mode: "stable" is any version without a
// semver prerelease, "canary" the newest canary prerelease. falls back to the
// newest tag of any kind when the mode has none, as before.
export function resolveLatestTag(allTags: string[], packageName: string, mode: ResolveMode): string {
  const exact = allTags.filter((t) => moduleFromTag(t) === packageName)

  let candidates = exact
  if (candidates.length === 0) {
    const nameNoAt = packageName.replace(/^@/, "").toLowerCase()
    const nameDash = nameNoAt.replace(/\//g, "-")
    candidates = allTags.filter((t) => t.toLowerCase().includes(nameNoAt) || t.toLowerCase().includes(nameDash))
  }
  if (candidates.length === 0) candidates = allTags

  const parsed = candidates
    .map((raw) => ({ raw, version: parseSemver(versionFromTag(raw).replace(/^V/, "v")) }))
    .filter((t): t is { raw: string; version: ParsedVersion } => t.version !== null)

  const inMode = parsed.filter((t) => matchesMode(t.version, mode))
  const pool = inMode.length > 0 ? inMode : parsed

  return pool.sort((a, b) => compareSemver(b.version, a.version))[0]?.raw ?? ""
}
