import { describe, expect, test } from "bun:test"
import {
  cacheExportFor,
  dockerBuildFor,
  fillRefs,
  parseSettingsYaml,
  renderDockerBuild,
  resolvePreview,
  validateDockerBuild
} from "../src/settings"

const SETTINGS = `
modules:
  overrides:
    - name: "@scope/frontend"
      docker:
        build_args:
          NEXT_PUBLIC_SENTRY_DSN: \${{ vars.NEXT_PUBLIC_SENTRY_DSN }}
          SENTRY_ORG: "\${{ vars.SENTRY_ORG }}"
          PLAIN: literal
        secrets:
          sentry_auth_token: \${{ secrets.SENTRY_AUTH_TOKEN }}
    - name: "@scope/backend"
      docker_compose_service: backend
      docker:
        network: host
        build_args:
          CDS_TRAINING_DB_URL: jdbc:postgresql://localhost:5432/app
        service:
          image: postgis/postgis:16-3.4
          port: 5432
          env:
            POSTGRES_HOST_AUTH_METHOD: trust
            POSTGRES_DB: app
          options: --health-cmd pg_isready --health-interval 5s
        preview:
          build_args:
            CDS_TRAINING_DB_URL: ~
            PREVIEW: "true"
          service: false
    - name: "@scope/other"
      docker_compose_service: other

deploy:
  previews:
    images:
      - "@scope/backend"
      - "@scope/other"
`

const EMPTY = {
  build_args: {},
  secrets: {},
  network: "",
  service_image: "",
  service_options: "",
  builder: "",
  cache_to: "max"
}

describe("docker build settings", () => {
  const s = parseSettingsYaml(SETTINGS)

  test("a module without docker settings builds as before", () => {
    expect(dockerBuildFor(s, "@scope/other")).toEqual(EMPTY)
    expect(dockerBuildFor(s, "@scope/unknown")).toEqual(EMPTY)
    expect(dockerBuildFor(parseSettingsYaml(""), "@scope/backend")).toEqual(EMPTY)
  })

  test("other override keys are kept", () => {
    expect(s.modules?.overrides?.[1].docker_compose_service).toBe("backend")
  })

  test("build args and secrets stay templates", () => {
    expect(dockerBuildFor(s, "@scope/frontend")).toEqual({
      ...EMPTY,
      build_args: {
        NEXT_PUBLIC_SENTRY_DSN: "${{ vars.NEXT_PUBLIC_SENTRY_DSN }}",
        SENTRY_ORG: "${{ vars.SENTRY_ORG }}",
        PLAIN: "literal"
      },
      secrets: { sentry_auth_token: "${{ secrets.SENTRY_AUTH_TOKEN }}" }
    })
  })

  test("a service becomes image and options", () => {
    expect(dockerBuildFor(s, "@scope/backend")).toEqual({
      build_args: { CDS_TRAINING_DB_URL: "jdbc:postgresql://localhost:5432/app" },
      secrets: {},
      network: "host",
      service_image: "postgis/postgis:16-3.4",
      service_options: "-p 127.0.0.1:5432:5432 -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=app --health-cmd pg_isready --health-interval 5s",
      builder: "",
      cache_to: "max"
    })
    expect(validateDockerBuild(s)).toEqual([])
  })

  test("preview settings drop args and the service for previews only", () => {
    expect(dockerBuildFor(s, "@scope/backend", { preview: true })).toEqual({
      ...EMPTY,
      build_args: { PREVIEW: "true" },
      network: "host"
    })
    expect(dockerBuildFor(s, "@scope/frontend", { preview: true })).toEqual(dockerBuildFor(s, "@scope/frontend"))
  })

  test("previews carry docker_build only for configured modules", () => {
    const p = resolvePreview(s, { pr: 1, sha: "0123456789abcdef", repository: "o/r" })
    expect(p.images[0].docker_build).toEqual(dockerBuildFor(s, "@scope/backend", { preview: true }))
    expect(p.images[1]).toEqual({ name: "@scope/other", image: "ghcr.io/o/r/scope-other" })
  })

  test("validation", () => {
    const bad = parseSettingsYaml(`
modules:
  overrides:
    - name: "@scope/backend"
      docker:
        service:
          port: db
          env:
            LABEL: two words
`)
    expect(validateDockerBuild(bad)).toEqual([
      "modules.overrides[@scope/backend].docker.service.image is required",
      'modules.overrides[@scope/backend].docker.service.port must be a number, got "db"',
      "modules.overrides[@scope/backend].docker.service.env.LABEL must not contain whitespace"
    ])
  })
})

describe("persistent builder", () => {
  const withBuilder = (builder: string) => parseSettingsYaml(`${SETTINGS}
docker:
  builder:
${builder}
`)

  test("without docker.builder every build gets a throwaway builder", () => {
    const s = parseSettingsYaml(SETTINGS)
    expect(s.docker).toBeUndefined()
    expect(dockerBuildFor(s, "@scope/frontend").builder).toBe("")
    expect(cacheExportFor(dockerBuildFor(s, "@scope/frontend"), "self-hosted")).toBe("max")
  })

  test("a named builder per network, cache_to min by default", () => {
    const s = withBuilder("    persistent: true")
    expect(dockerBuildFor(s, "@scope/frontend")).toMatchObject({ builder: "justactions", cache_to: "min" })
    expect(dockerBuildFor(s, "@scope/backend")).toMatchObject({ builder: "justactions-host", cache_to: "min" })
    expect(dockerBuildFor(s, "@scope/other")).toEqual({ ...EMPTY, builder: "justactions", cache_to: "min" })
    expect(validateDockerBuild(s)).toEqual([])
  })

  test("name and cache_to are configurable", () => {
    const s = withBuilder("    persistent: true\n    name: ci\n    cache_to: off")
    expect(dockerBuildFor(s, "@scope/backend")).toMatchObject({ builder: "ci-host", cache_to: "off" })
    expect(dockerBuildFor(s, "@scope/backend", { preview: true }).builder).toBe("ci-host")
  })

  test("persistent: false keeps the throwaway builder", () => {
    expect(dockerBuildFor(withBuilder("    persistent: false\n    name: ci"), "@scope/frontend").builder).toBe("")
  })

  test("every preview image gets docker_build with a persistent builder", () => {
    const p = resolvePreview(withBuilder("    persistent: true"), { pr: 1, sha: "0123456789abcdef", repository: "o/r" })
    expect(p.images[1].docker_build).toEqual({ ...EMPTY, builder: "justactions", cache_to: "min" })
  })

  test("the cache export drops only on self-hosted runners", () => {
    const build = { builder: "justactions", cache_to: "off" as const }
    expect(cacheExportFor(build, "self-hosted")).toBe("off")
    expect(cacheExportFor(build, "github-hosted")).toBe("max")
    expect(cacheExportFor(build, "")).toBe("max")
  })

  test("validation", () => {
    expect(validateDockerBuild(withBuilder("    persistent: true\n    name: a b\n    cache_to: none"))).toEqual([
      'docker.builder.name must be letters, digits, ".", "_" or "-", got "a b"',
      'docker.builder.cache_to must be "max", "min" or "off", got "none"'
    ])
  })
})

describe("renderDockerBuild", () => {
  const ctx = { vars: { SENTRY_ORG: "acme", NEXT_PUBLIC_SENTRY_DSN: "https://dsn" }, secrets: { SENTRY_AUTH_TOKEN: "tok" } }

  test("fills vars and secrets into KEY=value lines", () => {
    const s = parseSettingsYaml(SETTINGS)
    const r = renderDockerBuild(dockerBuildFor(s, "@scope/frontend"), ctx)
    expect(r.build_args.split("\n")).toEqual(["NEXT_PUBLIC_SENTRY_DSN=https://dsn", "SENTRY_ORG=acme", "PLAIN=literal"])
    expect(r.secrets).toBe("sentry_auth_token=tok")
    expect(r.missing).toEqual([])
  })

  test("nothing configured renders nothing", () => {
    expect(renderDockerBuild(EMPTY, ctx)).toEqual({ build_args: "", secrets: "", missing: [] })
  })

  test("an unset reference is empty and reported", () => {
    const missing: string[] = []
    expect(fillRefs("a-${{ vars.NOPE }}-${{secrets.SENTRY_AUTH_TOKEN}}", ctx, missing)).toBe("a--tok")
    expect(missing).toEqual(["vars.NOPE"])
  })

  test("other expressions are rejected", () => {
    expect(() => fillRefs("${{ github.sha }}", ctx)).toThrow("only")
  })
})
