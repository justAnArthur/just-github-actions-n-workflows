import { describe, expect, test } from "bun:test"
import { parseSecrets, planDeployHooks, releaseChannel, renderHookSummary } from "../src/deploy-hooks"
import type { DeployHookTarget } from "../src/settings"

const targets: Record<string, DeployHookTarget> = {
  "avis-fo": { hook_secret: "VERCEL_HOOK_AVIS_FO", channels: ["beta", "stable"], packages: ["@camasys/www"] },
  "budget-fo": { hook_secret: "VERCEL_HOOK_BUDGET_FO", channels: ["beta"], packages: ["@camasys/www"] },
  "docs": { hook_secret: "VERCEL_HOOK_DOCS", channels: ["stable"], packages: [] }
}

const firing = (pkg: string, channel: string) =>
  planDeployHooks(targets, pkg, channel).filter((e) => e.fire).map((e) => e.name)

describe("releaseChannel", () => {
  test("empty prerelease channel is stable", () => {
    expect(releaseChannel("")).toBe("stable")
    expect(releaseChannel(undefined)).toBe("stable")
  })

  test("prerelease channel passes through", () => {
    expect(releaseChannel("beta")).toBe("beta")
  })
})

describe("planDeployHooks", () => {
  test("beta tag fires every target on the beta channel", () => {
    expect(firing("@camasys/www", "beta")).toEqual(["avis-fo", "budget-fo"])
  })

  test("stable tag fires only cut-over targets", () => {
    expect(firing("@camasys/www", "stable")).toEqual(["avis-fo", "docs"])
  })

  test("other packages only reach targets without a package filter", () => {
    expect(firing("@camasys/other", "stable")).toEqual(["docs"])
  })

  test("skipped targets carry a reason", () => {
    const budget = planDeployHooks(targets, "@camasys/www", "stable").find((e) => e.name === "budget-fo")
    expect(budget?.fire).toBe(false)
    expect(budget?.reason).toBe("channel stable not in [beta]")
  })
})

describe("parseSecrets", () => {
  test("parses a secrets object", () => {
    expect(parseSecrets('{"A":"x"}')).toEqual({ A: "x" })
  })

  test("empty input yields no secrets", () => {
    expect(parseSecrets("")).toEqual({})
  })

  test("rejects non-objects without echoing the input", () => {
    expect(() => parseSecrets("not-json-secret-value")).toThrow("not valid JSON")
    expect(() => parseSecrets("[1]")).toThrow("must be a JSON object")
  })
})

describe("renderHookSummary", () => {
  test("renders a markdown table", () => {
    const md = renderHookSummary("@camasys/www@1.0.0-beta.3", "beta", [
      { name: "avis-fo", status: "fired", detail: "HTTP 201" },
      { name: "docs", status: "skipped", detail: "channel beta not in [stable]" }
    ])
    expect(md).toContain("| `avis-fo` | fired | HTTP 201 |")
    expect(md).toContain("| `docs` | skipped | channel beta not in [stable] |")
  })
})
