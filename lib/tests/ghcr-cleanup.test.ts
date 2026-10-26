import { afterEach, describe, expect, test } from "bun:test"
import { deleteImagesWithTagPrefix, deletePrereleaseImages, isCleanupTag } from "../src/ghcr/delete-canary-images"

describe("isCleanupTag", () => {
  test("matches the promoted channel only", () => {
    expect(isCleanupTag("5.2.0-canary.3", { channel: "canary" })).toBe(true)
    expect(isCleanupTag("6.0.0-beta.4", { channel: "canary" })).toBe(false)
    expect(isCleanupTag("5.2.0-rc.1", { channel: "canary" })).toBe(false)
    expect(isCleanupTag("6.0.0-beta.4", { channel: "beta" })).toBe(true)
  })

  test("never matches stable, non-semver or preview tags", () => {
    expect(isCleanupTag("5.2.0", { channel: "canary" })).toBe(false)
    expect(isCleanupTag("latest", { channel: "canary" })).toBe(false)
    expect(isCleanupTag("pr-12-abcdef12", { channel: "canary" })).toBe(false)
  })

  test("limits to the major when given", () => {
    expect(isCleanupTag("5.2.0-beta.1", { channel: "beta", major: 5 })).toBe(true)
    expect(isCleanupTag("6.0.0-beta.4", { channel: "beta", major: 5 })).toBe(false)
  })
})

describe("deletePrereleaseImages", () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  test("deletes only same-channel, same-major versions", async () => {
    const versions = [
      { id: 1, name: "a", metadata: { container: { tags: ["5.1.0-canary.0"] } } },
      { id: 2, name: "b", metadata: { container: { tags: ["5.1.0-canary.1"] } } },
      { id: 3, name: "c", metadata: { container: { tags: ["6.0.0-beta.4"] } } },
      { id: 4, name: "d", metadata: { container: { tags: ["6.0.0-canary.2"] } } },
      { id: 5, name: "e", metadata: { container: { tags: ["5.0.0"] } } },
      { id: 6, name: "f", metadata: { container: { tags: [] } } },
      { id: 7, name: "g", metadata: { container: { tags: ["5.1.0-canary.2", "5.1.0"] } } },
      { id: 8, name: "h", metadata: { container: { tags: ["buildcache"] } } }
    ]
    const deleted: string[] = []
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        deleted.push(url.split("/").pop()!)
        return new Response(null, { status: 204 })
      }
      return Response.json(versions)
    }) as typeof fetch

    const count = await deletePrereleaseImages("utegsk", "camasys/camasys-backend", "t", { channel: "canary", major: 5 })

    expect(count).toBe(2)
    expect(deleted).toEqual(["1", "2"])
  })
})

describe("deleteImagesWithTagPrefix", () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
  })

  test("deletes the pull request's images, never the build caches", async () => {
    const versions = [
      { id: 1, name: "a", metadata: { container: { tags: ["pr-12-0123abcd"] } } },
      { id: 2, name: "b", metadata: { container: { tags: ["pr-120-0123abcd"] } } },
      { id: 3, name: "c", metadata: { container: { tags: ["buildcache"] } } },
      { id: 4, name: "d", metadata: { container: { tags: ["buildcache-preview"] } } },
      { id: 5, name: "e", metadata: { container: { tags: ["pr-12-89abcdef", "buildcache-preview"] } } },
      { id: 6, name: "f", metadata: { container: { tags: [] } } }
    ]
    const deleted: string[] = []
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") {
        deleted.push(url.split("/").pop()!)
        return new Response(null, { status: 204 })
      }
      return Response.json(versions)
    }) as typeof fetch

    expect(await deleteImagesWithTagPrefix("o", "r/scope-backend", "pr-12-", "t")).toBe(1)
    expect(deleted).toEqual(["1"])
  })
})
