// calculate-semver.ts
// ---
// semver bump logic.
// given a current version string, a bump level (patch/minor/major),
// and a release channel (stable or any prerelease label like canary,
// beta, alpha, rc …), produces the next version.
//
// conventional commit types are mapped to semver levels via
// `CONVENTIONAL_TO_SEMVER` so callers don't need to handle the mapping.
// ---

import type { ParsedVersion } from "./parse-semver"
import { formatSemver, parseSemver } from "./parse-semver"

export type { ParsedVersion }

// --- semver bump levels ---

export const SEMVER = {
  PATCH: 0,
  MINOR: 1,
  MAJOR: 2
} as const

export type SEMVER = (typeof SEMVER)[keyof typeof SEMVER] | number;

// --- well-known prerelease channels (in precedence order) ---
// used to detect the channel from an existing prerelease identifier.

export const PRERELEASE_CHANNELS = [
  "alpha",
  "beta",
  "rc",
  "canary"
] as const

// --- conventional commit → semver mapping ---
// maps each conventional commit type to its default bump level.
// breaking changes always produce a major bump.

export const CONVENTIONAL_TO_SEMVER: Record<string, SEMVER> = {
  fix: SEMVER.PATCH,
  feat: SEMVER.MINOR,
  chore: SEMVER.PATCH,
  docs: SEMVER.PATCH,
  style: SEMVER.PATCH,
  refactor: SEMVER.PATCH,
  perf: SEMVER.MINOR,
  test: SEMVER.PATCH,
  build: SEMVER.PATCH,
  ci: SEMVER.PATCH,
  revert: SEMVER.PATCH,
  "BREAKING-CHANGE": SEMVER.MAJOR
}

// --- prerelease increment ---
// bumps the numeric suffix of a prerelease identifier for the given
// channel.  e.g. `beta.3` → `beta.4`,  `null` → `<channel>.0`.
// when the existing label doesn't match the requested channel the
// counter resets to 0.

function incrementPrerelease(
  prerelease: string | null,
  channel: string = "canary"
): string {
  if (!prerelease) return `${channel}.0`

  const parts = prerelease.split(".")
  if (parts[0] !== channel) return `${channel}.0`

  const lastNumIndex =
    parts
      .map((p, i) => (/^\d+$/.test(p) ? i : -1))
      .filter((i) => i >= 0)
      .pop() ?? -1

  if (lastNumIndex === -1) {
    parts.push("1")
  } else {
    parts[lastNumIndex] = String(parseInt(parts[lastNumIndex], 10) + 1)
  }

  return parts.join(".")
}

// --- detect channel from prerelease ---
// inspects the prerelease string and returns the channel label if it
// matches a well-known channel or any leading alphabetic identifier.

export function detectChannel(prerelease: string | null): string | null {
  if (!prerelease) return null
  const label = prerelease.split(".")[0]
  return label && /^[a-zA-Z]+$/.test(label) ? label : null
}

// --- bump strategies ---

function bumpPrerelease(
  version: ParsedVersion,
  _semver: SEMVER | undefined,
  channel: string = "canary"
) {
  version.prerelease = incrementPrerelease(version.prerelease, channel)
}

function bumpStable(version: ParsedVersion, semver: SEMVER | undefined) {
  version.prerelease = null
  version.build = null

  switch (semver) {
    case SEMVER.PATCH:
      version.patch += 1
      break
    case SEMVER.MINOR:
      version.minor += 1
      version.patch = 0
      break
    case SEMVER.MAJOR:
      version.major += 1
      version.minor = 0
      version.patch = 0
      break
  }
}

// --- public api ---
// calculates the next version from a version string.
//
// `channel` accepts:
//   - `"stable"` — strip prerelease, bump core version
//   - any other string (`"canary"`, `"beta"`, `"alpha"`, `"rc"`, …)
//       — bump the prerelease counter for that channel
//   - `undefined` — auto-detect from the current version's prerelease
//       identifier; falls back to a stable bump when there is none.

export function calculateNextSemver(
  currentVersion: string,
  semver: SEMVER | undefined,
  channel?: string
): string {
  const parsed = parseSemver(currentVersion)
  if (!parsed) throw new Error(`invalid semver version: ${currentVersion}`)

  if (channel === "stable") {
    bumpStable(parsed, semver)
  } else if (channel) {
    bumpPrerelease(parsed, semver, channel)
  } else {
    // auto-detect channel from the current version
    if (parsed.prerelease) {
      const detected = detectChannel(parsed.prerelease) ?? "canary"
      bumpPrerelease(parsed, semver, detected)
    } else {
      bumpStable(parsed, semver)
    }
  }

  return formatSemver(parsed)
}
