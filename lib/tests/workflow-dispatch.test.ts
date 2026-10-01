import { afterAll, describe, expect, test } from "bun:test"
import { join } from "node:path"
import {
  dispatchWorkflow,
  globToRegExp,
  loadWorkflows,
  normalizeOn,
  parseTagList,
  planDispatch,
  runsOnTagPush
} from "../src/workflow-dispatch"

const TEMPLATES = join(import.meta.dir, "..", "..", "workflows")
const SCOPED = "@scope/pkg@1.2.3"

describe("parseTagList", () => {
  test("reads a JSON array", () => {
    expect(parseTagList('["@a/b@1.0.0","c@2.0.0"]')).toEqual(["@a/b@1.0.0", "c@2.0.0"])
  })

  test("reads comma and newline separated lists", () => {
    expect(parseTagList("a@1.0.0, b@2.0.0\nc@3.0.0\n")).toEqual(["a@1.0.0", "b@2.0.0", "c@3.0.0"])
  })

  test("empty input yields no tags", () => {
    expect(parseTagList("")).toEqual([])
    expect(parseTagList("[]")).toEqual([])
  })
})

describe("globToRegExp", () => {
  test("`*@*` matches scoped and unscoped package tags", () => {
    expect(globToRegExp("*@*")!.test(SCOPED)).toBe(true)
    expect(globToRegExp("*@*")!.test("pkg@1.0.0")).toBe(true)
    expect(globToRegExp("*@*")!.test("v1.0.0")).toBe(false)
  })

  test("narrowed patterns only match their package", () => {
    expect(globToRegExp("@scope/api@*")!.test("@scope/api@1.0.0")).toBe(true)
    expect(globToRegExp("@scope/api@*")!.test("@scope/web@1.0.0")).toBe(false)
  })

  test("supports ?, + and character classes", () => {
    expect(globToRegExp("v[0-9]+.0.0")!.test("v12.0.0")).toBe(true)
    expect(globToRegExp("vv?1")!.test("v1")).toBe(true)
  })

  test("escapes regex metacharacters", () => {
    expect(globToRegExp("a.b")!.test("axb")).toBe(false)
  })
})

describe("runsOnTagPush", () => {
  test("honours tags filters with negation", () => {
    const on = normalizeOn({ push: { tags: ["*@*", "!*@*-canary.*"] } })
    expect(runsOnTagPush(on, SCOPED)).toBe(true)
    expect(runsOnTagPush(on, "@scope/pkg@1.2.3-canary.0")).toBe(false)
  })

  test("honours tags-ignore", () => {
    const on = normalizeOn({ push: { "tags-ignore": ["v*"] } })
    expect(runsOnTagPush(on, SCOPED)).toBe(true)
    expect(runsOnTagPush(on, "v1.0.0")).toBe(false)
  })

  test("branch-only, unfiltered and push-less workflows are not tag workflows", () => {
    expect(runsOnTagPush(normalizeOn({ push: { branches: ["main"] } }), SCOPED)).toBe(false)
    expect(runsOnTagPush(normalizeOn("push"), SCOPED)).toBe(false)
    expect(runsOnTagPush(normalizeOn(["push", "pull_request"]), SCOPED)).toBe(false)
    expect(runsOnTagPush(normalizeOn({ workflow_dispatch: null }), SCOPED)).toBe(false)
  })
})

describe("planDispatch", () => {
  test("passes the tag input when declared", () => {
    const on = normalizeOn({ push: { tags: ["*@*"] }, workflow_dispatch: { inputs: { tag: { required: true } } } })
    expect(planDispatch({ file: "x.yml", on }, SCOPED)).toEqual({ file: "x.yml", inputs: { tag: SCOPED } })
  })

  test("dispatches without inputs when none are declared", () => {
    const on = normalizeOn({ push: { tags: ["*@*"] }, workflow_dispatch: null })
    expect(planDispatch({ file: "x.yml", on }, SCOPED)).toEqual({ file: "x.yml", inputs: {} })
  })

  test("refuses when another required input has no default", () => {
    const on = normalizeOn({
      push: { tags: ["*@*"] },
      workflow_dispatch: { inputs: { tag: { required: true }, env: { required: true } } }
    })
    expect(planDispatch({ file: "x.yml", on }, SCOPED)).toBeNull()
  })

  test("refuses without a workflow_dispatch trigger", () => {
    expect(planDispatch({ file: "x.yml", on: normalizeOn({ push: { tags: ["*@*"] } }) }, SCOPED)).toBeNull()
  })
})

describe("toolkit templates", () => {
  test("every tag-triggered template is found and dispatchable with the tag", async () => {
    const workflows = await loadWorkflows(TEMPLATES)
    const plans = workflows
      .filter((w) => runsOnTagPush(w.on, SCOPED))
      .map((w) => planDispatch(w, SCOPED))

    expect(plans.map((p) => p?.file).sort()).toEqual([
      "deploy-vercel-on-tag.yml",
      "publish-docker-on-tag.yml",
      "publish-npm-on-tag.yml",
      "release-on-tag.yml"
    ])
    for (const plan of plans) expect(plan!.inputs).toEqual({ tag: SCOPED })
  })

  test("a missing workflows directory yields nothing", async () => {
    expect(await loadWorkflows(join(TEMPLATES, "does-not-exist"))).toEqual([])
  })
})

describe("dispatchWorkflow", () => {
  const requests: { path: string; auth: string | null; body: any }[] = []
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const path = new URL(req.url).pathname
      requests.push({ path, auth: req.headers.get("authorization"), body: await req.json() })
      return path.includes("missing.yml")
        ? new Response("Not Found", { status: 404 })
        : new Response(null, { status: 204 })
    }
  })
  const apiUrl = `http://localhost:${server.port}`
  afterAll(() => server.stop(true))

  test("posts the tag ref and inputs to the dispatch endpoint", async () => {
    await dispatchWorkflow({
      apiUrl, repository: "o/r", token: "t", file: "publish-npm-on-tag.yml", ref: SCOPED, inputs: { tag: SCOPED }
    })
    expect(requests.at(-1)).toEqual({
      path: "/repos/o/r/actions/workflows/publish-npm-on-tag.yml/dispatches",
      auth: "Bearer t",
      body: { ref: SCOPED, inputs: { tag: SCOPED } }
    })
  })

  test("throws on a non-2xx response", async () => {
    await expect(
      dispatchWorkflow({ apiUrl, repository: "o/r", token: "t", file: "missing.yml", ref: SCOPED, inputs: {} })
    ).rejects.toThrow(/404/)
  })
})
