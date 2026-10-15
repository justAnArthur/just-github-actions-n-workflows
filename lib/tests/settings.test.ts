import { describe, expect, test } from "bun:test"
import { parseSettingsYaml } from "../src/settings"

describe("parseSettingsYaml", () => {
  test("parses deploy targets with defaults", () => {
    const settings = parseSettingsYaml(`
deploy:
  ssh_target_path: ~/my-app
  targets:
    production:
      host: app.example.com
      compose_profiles: "@scope/backend,@scope/frontend"
    staging: {}
`)
    expect(settings.deploy?.ssh_target_path).toBe("~/my-app")
    expect(settings.deploy?.targets.production.host).toBe("app.example.com")
    expect(settings.deploy?.targets.production.timezone).toBe("UTC")
    expect(settings.deploy?.targets.staging.host).toBe("staging")
  })

  test("parses module overrides as a list", () => {
    const settings = parseSettingsYaml(`
modules:
  overrides:
    - name: "@scope/backend"
      docker_compose_service: backend
    - name: "@scope/frontend"
      docker_compose_service: frontend
`)
    expect(settings.modules?.overrides).toEqual([
      { name: "@scope/backend", docker_compose_service: "backend" },
      { name: "@scope/frontend", docker_compose_service: "frontend" }
    ])
  })

  test("parses vercel targets from lists or comma strings", () => {
    const settings = parseSettingsYaml(`
vercel:
  targets:
    avis-fo:
      hook_secret: VERCEL_HOOK_AVIS_FO
      channels: [beta, stable]
      packages: ["@camasys/www"]
    budget-fo:
      hook_secret: VERCEL_HOOK_BUDGET_FO
      channels: "beta, rc"
`)
    expect(settings.vercel?.targets["avis-fo"]).toEqual({
      hook_secret: "VERCEL_HOOK_AVIS_FO",
      channels: ["beta", "stable"],
      packages: ["@camasys/www"]
    })
    expect(settings.vercel?.targets["budget-fo"]).toEqual({
      hook_secret: "VERCEL_HOOK_BUDGET_FO",
      channels: ["beta", "rc"],
      packages: []
    })
  })

  test("vercel target channels default to stable", () => {
    const settings = parseSettingsYaml(`
vercel:
  targets:
    prod:
      hook_secret: VERCEL_HOOK_PROD
`)
    expect(settings.vercel?.targets.prod.channels).toEqual(["stable"])
  })

  test("vercel target without hook_secret is rejected", () => {
    expect(() => parseSettingsYaml(`
vercel:
  targets:
    prod:
      channels: [stable]
`)).toThrow("vercel.targets.prod.hook_secret is required")
  })

  test("empty file yields empty settings", () => {
    expect(parseSettingsYaml("# only comments\n")).toEqual({})
  })
})
