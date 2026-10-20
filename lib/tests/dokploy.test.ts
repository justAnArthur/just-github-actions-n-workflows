import { describe, expect, test } from "bun:test"
import { createDokployClient, type DokployDeployment, latestDeployment, waitForDeployment } from "../src/dokploy/client"
import { mergeEnv } from "../src/dokploy/env"

describe("mergeEnv", () => {
  test("replaces existing keys in place", () => {
    expect(mergeEnv("A=1\nTAG=old\nB=2", "TAG=new")).toBe("A=1\nTAG=new\nB=2")
  })

  test("appends new keys in update order", () => {
    expect(mergeEnv("A=1", "C=3\nB=2")).toBe("A=1\nC=3\nB=2")
  })

  test("keeps comments, blank lines and untouched secrets", () => {
    const existing = "# app\nSECRET=s3cr3t=with=equals\n\nTAG=1.0.0\n"
    expect(mergeEnv(existing, "TAG=1.1.0")).toBe("# app\nSECRET=s3cr3t=with=equals\n\nTAG=1.1.0\n")
  })

  test("ignores blank and comment lines in updates", () => {
    expect(mergeEnv("A=1", "\n# note\nB=2\n")).toBe("A=1\nB=2")
  })

  test("handles CRLF in both inputs", () => {
    expect(mergeEnv("A=1\r\nTAG=old\r\n", "TAG=new\r\nB=2\r\n")).toBe("A=1\nTAG=new\nB=2\n")
  })

  test("builds from an empty env", () => {
    expect(mergeEnv("", "A=1\nB=2")).toBe("A=1\nB=2")
  })

  test("returns the input unchanged when nothing changes", () => {
    expect(mergeEnv("A=1\nB=2\n", "B=2")).toBe("A=1\nB=2\n")
  })
})

function deployment(id: string, status: string, minute: number): DokployDeployment {
  return { deploymentId: id, status, createdAt: new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString() }
}

function stubClient(...polls: DokployDeployment[][]) {
  let call = 0
  return {
    calls: () => call,
    listDeployments: async () => polls[Math.min(call++, polls.length - 1)]
  }
}

const fast = { timeoutMs: 200, intervalMs: 5 }

describe("waitForDeployment", () => {
  test("returns the new deployment once it is done", async () => {
    const old = deployment("old", "done", 0)
    const client = stubClient(
      [old],
      [old, deployment("new", "running", 1)],
      [deployment("new", "done", 1), old]
    )
    const result = await waitForDeployment(client, "c1", "old", fast)
    expect(result.deploymentId).toBe("new")
    expect(client.calls()).toBe(3)
  })

  test("ignores the previous deployment even when it is done", async () => {
    const client = stubClient([deployment("old", "done", 0)])
    await expect(waitForDeployment(client, "c1", "old", { timeoutMs: 30, intervalMs: 5 })).rejects.toThrow(/no new deployment started/)
  })

  test("throws with the failed deployment as cause", async () => {
    const failed = deployment("new", "error", 1)
    const client = stubClient([deployment("old", "done", 0), failed])
    const error = await waitForDeployment(client, "c1", "old", fast).catch((e) => e)
    expect(error.message).toMatch(/new.*"error"/)
    expect(error.cause).toEqual(failed)
  })

  test("times out while the new deployment keeps running", async () => {
    const client = stubClient([deployment("old", "done", 0), deployment("new", "running", 1)])
    await expect(waitForDeployment(client, "c1", "old", { timeoutMs: 30, intervalMs: 5 })).rejects.toThrow(/timed out.*still "running"/)
  })

  test("accepts any deployment when there was none before", async () => {
    const client = stubClient([], [deployment("first", "done", 0)])
    expect((await waitForDeployment(client, "c1", "", fast)).deploymentId).toBe("first")
  })
})

describe("latestDeployment", () => {
  test("picks the newest by createdAt regardless of order", () => {
    expect(latestDeployment([deployment("a", "done", 1), deployment("b", "done", 3), deployment("c", "done", 2)])?.deploymentId).toBe("b")
    expect(latestDeployment([])).toBeUndefined()
  })
})

describe("createDokployClient", () => {
  test("sends queries as GET params and mutations as JSON bodies", async () => {
    const requests: { url: string; init: RequestInit }[] = []
    const fakeFetch = (async (url: string, init: RequestInit) => {
      requests.push({ url, init })
      return new Response(JSON.stringify({ composeId: "c1" }))
    }) as unknown as typeof fetch
    const client = createDokployClient("https://dokploy.test/", "key", fakeFetch)

    await client.getCompose("c1")
    await client.updateCompose({ composeId: "c1", env: "A=1" })

    expect(requests[0].url).toBe("https://dokploy.test/api/compose.one?composeId=c1")
    expect(requests[0].init.method).toBe("GET")
    expect(requests[1].url).toBe("https://dokploy.test/api/compose.update")
    expect(JSON.parse(requests[1].init.body as string)).toEqual({ composeId: "c1", env: "A=1" })
    expect((requests[1].init.headers as Record<string, string>)["x-api-key"]).toBe("key")
  })

  test("errors carry method, path, status and a truncated body but not the key", async () => {
    const fakeFetch = (async () => new Response("x".repeat(2000), { status: 401 })) as unknown as typeof fetch
    const client = createDokployClient("https://dokploy.test", "super-secret", fakeFetch)
    const error = await client.listDeployments("c1").catch((e) => e)
    expect(error.message).toStartWith("dokploy GET /api/deployment.allByCompose failed with HTTP 401: xxx")
    expect(error.message.length).toBeLessThan(700)
    expect(error.message).not.toContain("super-secret")
  })
})
