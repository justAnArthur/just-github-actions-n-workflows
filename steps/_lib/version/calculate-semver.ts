// calculate-semver.ts
// ---
// semver bump logic.
// given a current version string, a bump level (patch/minor/major),
// and a release channel (stable/canary), produces the next version.
//
// conventional commit types are mapped to semver levels via
// `CONVENTIONAL_TO_SEMVER` so callers don't need to handle the mapping.
// ---

import { formatSemver, parseSemver } from "./parse-semver";
import type { ParsedVersion } from "./parse-semver";

export type { ParsedVersion };

// --- semver bump levels ---

export const SEMVER = {
  PATCH: 0,
  MINOR: 1,
  MAJOR: 2,
} as const;

export type SEMVER = (typeof SEMVER)[keyof typeof SEMVER] | number;

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
  "BREAKING-CHANGE": SEMVER.MAJOR,
};

// --- canary prerelease increment ---
// bumps the numeric suffix: `canary.3` → `canary.4`.
// resets to `canary.0` when the prerelease label is missing or unexpected.

function incrementPrerelease(prerelease: string | null): string {
  if (!prerelease) return "canary.0";

  const parts = prerelease.split(".");
  if (parts[0] !== "canary") return "canary.0";

  const lastNumIndex =
    parts
      .map((p, i) => (/^\d+$/.test(p) ? i : -1))
      .filter((i) => i >= 0)
      .pop() ?? -1;

  if (lastNumIndex === -1) {
    parts.push("1");
  } else {
    parts[lastNumIndex] = String(parseInt(parts[lastNumIndex], 10) + 1);
  }

  return parts.join(".");
}

// --- bump strategies ---

function bumpCanary(version: ParsedVersion, _semver: SEMVER | undefined) {
  version.prerelease = incrementPrerelease(version.prerelease);
}

function bumpStable(version: ParsedVersion, semver: SEMVER | undefined) {
  version.prerelease = null;
  version.build = null;

  switch (semver) {
    case SEMVER.PATCH:
      version.patch += 1;
      break;
    case SEMVER.MINOR:
      version.minor += 1;
      version.patch = 0;
      break;
    case SEMVER.MAJOR:
      version.major += 1;
      version.minor = 0;
      version.patch = 0;
      break;
  }
}

// --- public api ---
// calculates the next version from a version string.
// when `stableOrCanary` is omitted, the channel is inferred from
// whether the current version already has a prerelease identifier.

export function calculateNextSemver(
  currentVersion: string,
  semver: SEMVER | undefined,
  stableOrCanary?: string
): string {
  const parsed = parseSemver(currentVersion);
  if (!parsed) throw new Error(`invalid semver version: ${currentVersion}`);

  switch (stableOrCanary) {
    case "stable":
      bumpStable(parsed, semver);
      break;
    case "canary":
      bumpCanary(parsed, semver);
      break;
    case undefined:
      // auto-detect channel from the current version
      if (parsed.prerelease) bumpCanary(parsed, semver);
      else bumpStable(parsed, semver);
      break;
    default:
      throw new Error(`invalid stableOrCanary value: ${stableOrCanary}`);
  }

  return formatSemver(parsed);
}
