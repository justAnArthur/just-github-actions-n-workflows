export interface ParsedVersion {
  prefixV: boolean;
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
  build: string | null;
}

export function parseSemver(input: string): ParsedVersion | null {
  const match = input.match(
    /^(v)?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/
  )

  if (!match) return null

  return {
    prefixV: !!match[1],
    major: Number(match[2]),
    minor: Number(match[3]),
    patch: Number(match[4]),
    prerelease: match[5] || null,
    build: match[6] || null
  }
}

export function formatSemver(parsed: ParsedVersion): string {
  const core = `${parsed.major}.${parsed.minor}.${parsed.patch}`
  const pre = parsed.prerelease ? `-${parsed.prerelease}` : ""
  const build = parsed.build ? `+${parsed.build}` : ""
  return (parsed.prefixV ? "v" : "") + core + pre + build
}
