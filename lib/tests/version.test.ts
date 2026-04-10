import { describe, expect, test } from "bun:test"
import { formatSemver, parseSemver } from "../src/version/parse-semver"
import { calculateNextSemver, detectChannel } from "../src/version/calculate-semver"
import { compareSemver } from "../src/version/compare-semver"

describe("parseSemver", () => {
  test("parses basic version", () => {
    const result = parseSemver("1.2.3")
    expect(result).toEqual({
      prefixV: false,
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: null,
      build: null
    })
  })

  test("parses version with v prefix", () => {
    const result = parseSemver("v1.2.3")
    expect(result?.prefixV).toBe(true)
    expect(result?.major).toBe(1)
  })

  test("parses canary prerelease", () => {
    const result = parseSemver("1.2.3-canary.5")
    expect(result?.prerelease).toBe("canary.5")
  })

  test("parses beta prerelease", () => {
    const result = parseSemver("1.2.3-beta.0")
    expect(result?.prerelease).toBe("beta.0")
  })

  test("parses alpha prerelease", () => {
    const result = parseSemver("2.0.0-alpha.1")
    expect(result?.prerelease).toBe("alpha.1")
  })

  test("parses rc prerelease", () => {
    const result = parseSemver("1.0.0-rc.3")
    expect(result?.prerelease).toBe("rc.3")
  })

  test("returns null for invalid input", () => {
    expect(parseSemver("not-a-version")).toBeNull()
  })
})

describe("formatSemver", () => {
  test("round-trips a parsed version", () => {
    const input = "1.2.3-canary.5"
    const parsed = parseSemver(input)!
    expect(formatSemver(parsed)).toBe(input)
  })

  test("preserves v prefix", () => {
    const parsed = parseSemver("v1.0.0")!
    expect(formatSemver(parsed)).toBe("v1.0.0")
  })
})

describe("calculateNextSemver", () => {
  test("bumps canary prerelease", () => {
    expect(calculateNextSemver("1.0.0-canary.0", undefined, "canary")).toBe("1.0.0-canary.1")
  })

  test("bumps beta prerelease", () => {
    expect(calculateNextSemver("1.0.0-beta.2", undefined, "beta")).toBe("1.0.0-beta.3")
  })

  test("initializes alpha from stable", () => {
    expect(calculateNextSemver("1.0.0", undefined, "alpha")).toBe("1.0.0-alpha.0")
  })

  test("initializes rc from stable", () => {
    expect(calculateNextSemver("2.1.0", undefined, "rc")).toBe("2.1.0-rc.0")
  })

  test("bumps stable patch", () => {
    expect(calculateNextSemver("1.0.0", 0, "stable")).toBe("1.0.1")
  })

  test("bumps stable minor", () => {
    expect(calculateNextSemver("1.0.0", 1, "stable")).toBe("1.1.0")
  })

  test("bumps stable major", () => {
    expect(calculateNextSemver("1.0.0", 2, "stable")).toBe("2.0.0")
  })

  test("auto-detects canary channel", () => {
    expect(calculateNextSemver("1.0.0-canary.3", undefined)).toBe("1.0.0-canary.4")
  })

  test("auto-detects beta channel", () => {
    expect(calculateNextSemver("1.0.0-beta.1", undefined)).toBe("1.0.0-beta.2")
  })

  test("switches channel resets counter", () => {
    expect(calculateNextSemver("1.0.0-canary.5", undefined, "beta")).toBe("1.0.0-beta.0")
  })
})

describe("detectChannel", () => {
  test("detects canary", () => {
    expect(detectChannel("canary.3")).toBe("canary")
  })

  test("detects beta", () => {
    expect(detectChannel("beta.1")).toBe("beta")
  })

  test("detects alpha", () => {
    expect(detectChannel("alpha.0")).toBe("alpha")
  })

  test("returns null for null input", () => {
    expect(detectChannel(null)).toBeNull()
  })

  test("returns null for numeric-only", () => {
    expect(detectChannel("123")).toBeNull()
  })
})

describe("compareSemver", () => {
  test("compares major versions", () => {
    const a = parseSemver("2.0.0")!
    const b = parseSemver("1.0.0")!
    expect(compareSemver(a, b)).toBeGreaterThan(0)
  })

  test("stable > prerelease of same base", () => {
    const a = parseSemver("1.0.0")!
    const b = parseSemver("1.0.0-canary.5")!
    expect(compareSemver(a, b)).toBeGreaterThan(0)
  })

  test("beta.2 > beta.1", () => {
    const a = parseSemver("1.0.0-beta.2")!
    const b = parseSemver("1.0.0-beta.1")!
    expect(compareSemver(a, b)).toBeGreaterThan(0)
  })
})

