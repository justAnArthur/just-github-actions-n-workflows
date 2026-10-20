import { describe, expect, test } from "bun:test"
import { imageTagEnvKey } from "../src/ghcr/delete-canary-images"
import { parseImageRef } from "../src/ghcr/registry"
import {
  parseSettingsYaml,
  releaseModuleVersions,
  resolvePreview,
  targetsForChannel,
  validateDeployTarget,
  validatePreviews
} from "../src/settings"

const OLD_STYLE = `
# comment
deploy:
  ssh_target_path: ~/my-app
  compose_file: ./docker-compose.yml
  targets:
    production:
      host: app.example.com
      compose_profiles: "@scope/backend,@scope/frontend"
      profiles: "prod"
      timezone: Europe/Bratislava
    staging:
      compose_profiles: "@scope/backend"
      compose_file: ./docker-compose.staging.yml

git:
  committer_name: "github-actions[bot]"
  co_author_email: me@example.com
`

const DOKPLOY = `
deploy:
  dokploy:
    url: https://dokploy.example.com
  targets:
    demo:
      driver: dokploy
      channel: canary
      dokploy:
        compose_id: abc123
    prod:
      driver: dokploy
      channel: stable
      dokploy:
        compose_id: 42
    legacy-prod:
      host: app.example.com
      channel: manual
  previews:
    dokploy:
      environment_id: env-1
      server_id: srv-1
    host: "pr-{pr}.pr.example.com"
    compose_file: .github/preview/docker-compose.yml
    env:
      PREVIEW_DIR: /home/app/previews/pr-{pr}
      PUBLIC_URL: "https://{host}"
      TAG: "{image_tag}"
    images:
      - "@scope/backend"
      - "@scope/frontend"
    seed:
      ssh_host: test.example.com
      command: "bash ~/previews/pr-{pr}/seed.sh {app_name}-postgres-1"
      upload:
        .github/preview/seed.sh: ~/previews/pr-{pr}/seed.sh
    cleanup_command: "rm -rf ~/previews/pr-{pr}"
`

describe("settings — old-style file", () => {
  const s = parseSettingsYaml(OLD_STYLE)

  test("targets keep today's values and defaults", () => {
    expect(s.deploy?.ssh_target_path).toBe("~/my-app")
    expect(s.deploy?.compose_file).toBe("./docker-compose.yml")
    expect(s.deploy?.targets.production).toMatchObject({
      host: "app.example.com",
      compose_profiles: "@scope/backend,@scope/frontend",
      profiles: "prod",
      timezone: "Europe/Bratislava",
      driver: "ssh",
      channel: "manual"
    })
    // host falls back to the target name, as before
    expect(s.deploy?.targets.staging.host).toBe("staging")
    expect(s.deploy?.targets.staging.timezone).toBe("UTC")
    expect(s.deploy?.targets.staging.compose_file).toBe("./docker-compose.staging.yml")
    expect(s.deploy?.dokploy).toBeUndefined()
    expect(s.deploy?.previews).toBeUndefined()
  })

  test("git settings", () => {
    expect(s.git?.committer_name).toBe("github-actions[bot]")
    expect(s.git?.co_author_email).toBe("me@example.com")
  })

  test("validates and never auto-deploys", () => {
    expect(validateDeployTarget(s, "production")).toEqual([])
    expect(targetsForChannel(s, "stable")).toEqual([])
  })

  test("unquoted @scope values still parse through the fallback parser", () => {
    const legacy = parseSettingsYaml("deploy:\n  targets:\n    prod:\n      host: a.example.com\n      compose_profiles: @scope/backend\n")
    expect(legacy.deploy?.targets.prod.compose_profiles).toBe("@scope/backend")
    expect(legacy.deploy?.targets.prod.driver).toBe("ssh")
  })

  test("module overrides list", () => {
    const m = parseSettingsYaml('modules:\n  overrides:\n    - name: "@scope/backend"\n      docker_compose_service: backend\n')
    expect(m.modules?.overrides).toEqual([{ name: "@scope/backend", docker_compose_service: "backend" }])
  })
})

describe("settings — dokploy", () => {
  const s = parseSettingsYaml(DOKPLOY)

  test("targets", () => {
    expect(s.deploy?.dokploy?.url).toBe("https://dokploy.example.com")
    expect(s.deploy?.targets.demo).toMatchObject({ driver: "dokploy", channel: "canary", dokploy: { compose_id: "abc123" } })
    expect(s.deploy?.targets.prod.dokploy?.compose_id).toBe("42")
    expect(validateDeployTarget(s, "demo")).toEqual([])
    expect(validateDeployTarget(s, "legacy-prod")).toEqual([])
  })

  test("channels", () => {
    expect(targetsForChannel(s, "canary")).toEqual(["demo"])
    expect(targetsForChannel(s, "stable")).toEqual(["prod"])
    expect(targetsForChannel(s, "manual")).toEqual([])
  })

  test("validation errors", () => {
    const broken = parseSettingsYaml("deploy:\n  targets:\n    demo:\n      driver: dokploy\n      channel: nightly\n")
    const errors = validateDeployTarget(broken, "demo")
    expect(errors.some((e) => e.includes("deploy.dokploy.url"))).toBe(true)
    expect(errors.some((e) => e.includes("compose_id"))).toBe(true)
    expect(errors.some((e) => e.includes("channel"))).toBe(true)
    expect(validateDeployTarget(broken, "missing")).toEqual(["deploy.targets.missing is not defined"])
  })

  test("previews", () => {
    expect(validatePreviews(s)).toEqual([])
    expect(s.deploy?.previews?.images).toEqual(["@scope/backend", "@scope/frontend"])
    expect(s.deploy?.previews?.seed?.upload).toEqual({ ".github/preview/seed.sh": "~/previews/pr-{pr}/seed.sh" })
    expect(validatePreviews(parseSettingsYaml(OLD_STYLE))).toEqual(["deploy.previews is not defined"])
  })

  test("resolvePreview substitutes placeholders", () => {
    const p = resolvePreview(s, { pr: 12, sha: "0123456789abcdef", repository: "Owner/Repo" })
    expect(p.name).toBe("pr-12")
    expect(p.image_tag).toBe("pr-12-01234567")
    expect(p.host).toBe("pr-12.pr.example.com")
    expect(p.url).toBe("https://pr-12.pr.example.com")
    expect(p.env.split("\n")).toEqual([
      "DOCKER_SCOPE_BACKEND_IMAGE_TAG=pr-12-01234567",
      "DOCKER_SCOPE_FRONTEND_IMAGE_TAG=pr-12-01234567",
      "PREVIEW_DIR=/home/app/previews/pr-12",
      "PUBLIC_URL=https://pr-12.pr.example.com",
      "TAG=pr-12-01234567"
    ])
    expect(p.images).toEqual([
      { name: "@scope/backend", image: "ghcr.io/owner/repo/scope-backend" },
      { name: "@scope/frontend", image: "ghcr.io/owner/repo/scope-frontend" }
    ])
    expect(p.seed_command).toBe("bash ~/previews/pr-12/seed.sh {app_name}-postgres-1")
    expect(p.seed_upload).toEqual([{ source: ".github/preview/seed.sh", target: "previews/pr-12/seed.sh" }])
    expect(p.cleanup_command).toBe("rm -rf ~/previews/pr-12")
    expect(p.environment_id).toBe("env-1")
    expect(p.server_id).toBe("srv-1")
  })
})

describe("releaseModuleVersions", () => {
  const modules = [
    { name: "@scope/backend", dockerfilePath: "./Dockerfile", deployTargets: ["docker"] },
    { name: "@scope/frontend", dockerfilePath: undefined, deployTargets: ["docker"] },
    { name: "@scope/lib", dockerfilePath: undefined, deployTargets: ["npm"] }
  ]
  const tags = [
    "@scope/backend@1.0.0", "@scope/backend@1.1.0-beta.1", "@scope/backend@1.0.1",
    "@scope/frontend@2.0.0", "@scope/frontend@2.1.0-canary.3", "@scope/frontend@2.1.0-canary.10",
    "@scope/lib@5.0.0"
  ]

  test("stable ignores every prerelease", () => {
    expect(releaseModuleVersions(modules, tags, "@scope/backend@1.0.1", "stable"))
      .toEqual({ "@scope/backend": "1.0.1", "@scope/frontend": "2.0.0" })
  })

  test("canary takes the newest of anything and pins the released tag", () => {
    expect(releaseModuleVersions(modules, tags, "@scope/backend@1.1.0-beta.1", "canary"))
      .toEqual({ "@scope/backend": "1.1.0-beta.1", "@scope/frontend": "2.1.0-canary.10" })
  })
})

describe("image helpers", () => {
  test("imageTagEnvKey matches resolve-image-tags", () => {
    expect(imageTagEnvKey("@scope/backend")).toBe("DOCKER_SCOPE_BACKEND_IMAGE_TAG")
    expect(imageTagEnvKey("my-game")).toBe("DOCKER_MY_GAME_IMAGE_TAG")
  })

  test("parseImageRef", () => {
    expect(parseImageRef("ghcr.io/owner/repo/scope-backend:1.2.3"))
      .toEqual({ registry: "ghcr.io", path: "owner/repo/scope-backend", tag: "1.2.3" })
    expect(() => parseImageRef("ghcr.io/owner/repo")).toThrow()
  })
})

describe("settings — vercel fan-out", () => {
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
})
