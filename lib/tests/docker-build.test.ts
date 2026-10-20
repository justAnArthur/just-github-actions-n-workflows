import { describe, expect, test } from "bun:test"
import {
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
            POSTGRES_PASSWORD: postgres
            POSTGRES_DB: app
          options: --health-cmd pg_isready --health-interval 5s
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
  service_ports: "",
  service_options: ""
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

  test("a service becomes image, ports and options", () => {
    expect(dockerBuildFor(s, "@scope/backend")).toEqual({
      build_args: { CDS_TRAINING_DB_URL: "jdbc:postgresql://localhost:5432/app" },
      secrets: {},
      network: "host",
      service_image: "postgis/postgis:16-3.4",
      service_ports: "5432:5432",
      service_options: "-e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=app --health-cmd pg_isready --health-interval 5s"
    })
    expect(validateDockerBuild(s)).toEqual([])
  })

  test("previews carry docker_build only for configured modules", () => {
    const p = resolvePreview(s, { pr: 1, sha: "0123456789abcdef", repository: "o/r" })
    expect(p.images[0].docker_build).toEqual(dockerBuildFor(s, "@scope/backend"))
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
            PASSWORD: two words
`)
    expect(validateDockerBuild(bad)).toEqual([
      "modules.overrides[@scope/backend].docker.service.image is required",
      'modules.overrides[@scope/backend].docker.service.port must be a number, got "db"',
      "modules.overrides[@scope/backend].docker.service.env.PASSWORD must not contain whitespace"
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
