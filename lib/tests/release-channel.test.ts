import { describe, expect, test } from "bun:test"
import { parseSettingsYaml, releaseChannelFor } from "../src/settings"
import { calculateNextSemver, SEMVER } from "../src/version/calculate-semver"

describe("prerelease bump with a level", () => {
  test("from a stable version it goes above it", () => {
    expect(calculateNextSemver("5.66.6", SEMVER.PATCH, "canary")).toBe("5.66.7-canary.0")
    expect(calculateNextSemver("5.66.6", SEMVER.MINOR, "canary")).toBe("5.67.0-canary.0")
    expect(calculateNextSemver("5.66.6", SEMVER.MAJOR, "canary")).toBe("6.0.0-canary.0")
    expect(calculateNextSemver("1.7.0", SEMVER.PATCH, "canary")).toBe("1.7.1-canary.0")
  })

  test("a prerelease whose core already covers the level only counts up", () => {
    expect(calculateNextSemver("5.66.7-canary.0", SEMVER.PATCH, "canary")).toBe("5.66.7-canary.1")
    expect(calculateNextSemver("5.67.0-canary.2", SEMVER.MINOR, "canary")).toBe("5.67.0-canary.3")
    expect(calculateNextSemver("6.0.0-beta.13", SEMVER.MINOR, "beta")).toBe("6.0.0-beta.14")
  })

  test("a prerelease too low for the level is raised", () => {
    expect(calculateNextSemver("5.66.7-canary.3", SEMVER.MINOR, "canary")).toBe("5.67.0-canary.0")
    expect(calculateNextSemver("5.67.0-canary.3", SEMVER.MAJOR, "canary")).toBe("6.0.0-canary.0")
  })

  test("without a level only the counter moves, as before", () => {
    expect(calculateNextSemver("1.0.0", undefined, "alpha")).toBe("1.0.0-alpha.0")
    expect(calculateNextSemver("6.0.0-beta.13", undefined, "beta")).toBe("6.0.0-beta.14")
  })
})

describe("release.branches", () => {
  const settings = parseSettingsYaml(`
release:
  branches:
    main: stable
    canary: canary
    "versions/**": stable
`)

  test("exact names and globs", () => {
    expect(releaseChannelFor(settings, "canary")).toBe("canary")
    expect(releaseChannelFor(settings, "main")).toBe("stable")
    expect(releaseChannelFor(settings, "versions/5.x")).toBe("stable")
  })

  test("unlisted branches and repos without the setting keep the manifest's channel", () => {
    expect(releaseChannelFor(settings, "feature/x")).toBeUndefined()
    expect(releaseChannelFor(parseSettingsYaml(""), "canary")).toBeUndefined()
  })
})
