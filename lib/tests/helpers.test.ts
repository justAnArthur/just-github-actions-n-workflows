import { describe, expect, test } from "bun:test"
import { manifestNameToImageName } from "../src/ghcr/delete-canary-images"
import { cleanTagRef, isPrerelease, moduleFromTag, versionFromTag } from "../src/git/tag-utils"

describe("manifestNameToImageName", () => {
  test("strips @ prefix and replaces /", () => {
    expect(manifestNameToImageName("@camasys/backend_core")).toBe("camasys-backend_core")
  })

  test("returns empty for empty input", () => {
    expect(manifestNameToImageName("")).toBe("")
  })
})

describe("tag-utils", () => {
  test("versionFromTag extracts version", () => {
    expect(versionFromTag("@scope/pkg@1.2.3")).toBe("1.2.3")
  })

  test("moduleFromTag extracts module", () => {
    expect(moduleFromTag("@scope/pkg@1.2.3")).toBe("@scope/pkg")
  })

  test("isPrerelease detects canary", () => {
    expect(isPrerelease("1.0.0-canary.0")).toBe(true)
  })

  test("isPrerelease detects beta", () => {
    expect(isPrerelease("1.0.0-beta.1")).toBe(true)
  })

  test("isPrerelease returns false for stable", () => {
    expect(isPrerelease("1.0.0")).toBe(false)
  })

  test("cleanTagRef strips refs/tags/", () => {
    expect(cleanTagRef("refs/tags/v1.0.0")).toBe("v1.0.0")
  })
})

