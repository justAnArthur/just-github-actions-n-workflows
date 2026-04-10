// parse-semver.ts
// ---
// minimal semver parser and formatter.
// handles the `v` prefix, pre-release identifiers (e.g. `-canary.3`,
// `-beta.1`, `-alpha.0`, `-rc.2`), and build metadata (e.g. `+20240101`).
/// ---

// --- types ---

export interface ParsedVersion {
  prefixV: boolean;
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
  build: string | null;
}

// --- parse ---
// returns null when the input does not match a valid semver string.

export function parseSemver(input: string): ParsedVersion | null {
  const match = input.match(
    /^(v)?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/
  )

  if (!match) return null

  return {
    prefixV: !!match[1],
    major: parseInt(match[2], 10),
    minor: parseInt(match[3], 10),
    patch: parseInt(match[4], 10),
    prerelease: match[5] || null,
    build: match[6] || null
  }
}

// --- format ---
// reconstructs the version string from its parsed components.

export function formatSemver(parsed: ParsedVersion): string {
  const core = `${parsed.major}.${parsed.minor}.${parsed.patch}`
  const pre = parsed.prerelease ? `-${parsed.prerelease}` : ""
  const build = parsed.build ? `+${parsed.build}` : ""
  return (parsed.prefixV ? "v" : "") + core + pre + build
}

