import { describe, expect, test } from "bun:test"
import { resolveLatestTag } from "../src/version/resolve-latest-tag"

const tags = [
  "@scope/backend@5.1.0",
  "@scope/backend@5.2.0",
  "@scope/backend@5.3.0-canary.2",
  "@scope/backend@6.0.0-beta.4",
  "@scope/backend@6.0.0-rc.1",
  "@scope/backend@6.0.0-alpha.7",
  "@scope/backend_core@9.0.0",
  "@scope/frontend@1.0.0"
]

describe("resolveLatestTag", () => {
  test("stable skips every prerelease channel", () => {
    expect(resolveLatestTag(tags, "@scope/backend", "stable")).toBe("@scope/backend@5.2.0")
  })

  test("canary is the newest canary prerelease", () => {
    expect(resolveLatestTag(tags, "@scope/backend", "canary")).toBe("@scope/backend@5.3.0-canary.2")
  })

  test("compares prerelease numbers numerically", () => {
    const t = ["@a/b@1.0.0-canary.9", "@a/b@1.0.0-canary.10"]
    expect(resolveLatestTag(t, "@a/b", "canary")).toBe("@a/b@1.0.0-canary.10")
  })

  test("a package name that prefixes another doesn't pick up its tags", () => {
    expect(resolveLatestTag(tags, "@scope/backend", "stable")).not.toContain("backend_core")
  })

  test("falls back to the newest tag when the mode has none", () => {
    expect(resolveLatestTag(["@a/b@1.0.0-beta.1"], "@a/b", "stable")).toBe("@a/b@1.0.0-beta.1")
  })

  test("matches dash-named tags loosely when no exact module matches", () => {
    expect(resolveLatestTag(["scope-api@1.0.0", "scope-api@1.1.0"], "@scope/api", "stable")).toBe("scope-api@1.1.0")
  })

  test("empty when there are no tags", () => {
    expect(resolveLatestTag([], "@a/b", "stable")).toBe("")
  })
})
