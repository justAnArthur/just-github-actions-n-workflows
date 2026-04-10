// compare-semver.ts
// ---
// semver comparison utility for sorting parsed versions.
// compares two ParsedVersion objects by major.minor.patch,
// then by prerelease identifiers (numeric or lexicographic).
// ---

import type { ParsedVersion } from "./parse-semver"

// --- compare ---
// returns negative if a < b, positive if a > b, 0 if equal.
// stable versions sort higher than prereleases of the same base.

export function compareSemver(a: ParsedVersion, b: ParsedVersion): number {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  if (a.patch !== b.patch) return a.patch - b.patch

  if (!a.prerelease && !b.prerelease) return 0
  if (a.prerelease && !b.prerelease) return -1
  if (!a.prerelease && b.prerelease) return 1

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

