import { describe, expect, test } from "bun:test"
import { composeDeployScript } from "../src/compose-deploy"
import { fillEnvLines, parseSettingsYaml, resolveSshDeploy, validateDeployTarget } from "../src/settings"

const SSH = `
deploy:
  ssh_target_path: ~/app
  ssh:
    upload: [ deploy ]
    command: bash deploy/deploy.sh
    env:
      SENTRY_ENVIRONMENT: "{environment}"
      SENTRY_DSN: \${{ secrets.SENTRY_DSN }}
  targets:
    app.example.com:
      timezone: UTC
    legacy.example.com:
      ssh:
        command: ""
        upload: []
        env:
          SENTRY_DSN: ""
          EXTRA: x
    plain.example.com: {}
`

describe("deploy.ssh", () => {
  const settings = parseSettingsYaml(SSH)

  test("defaults apply to every ssh target, {environment} filled in", () => {
    expect(resolveSshDeploy(settings, "app.example.com")).toEqual({
      upload: ["deploy"],
      command: "bash deploy/deploy.sh",
      env: { SENTRY_ENVIRONMENT: "app.example.com", SENTRY_DSN: "${{ secrets.SENTRY_DSN }}" }
    })
  })

  test("a target's ssh block replaces upload and command, merges env", () => {
    expect(resolveSshDeploy(settings, "legacy.example.com")).toEqual({
      upload: [],
      command: "",
      env: { SENTRY_ENVIRONMENT: "legacy.example.com", SENTRY_DSN: "", EXTRA: "x" }
    })
  })

  test("without deploy.ssh nothing changes", () => {
    const plain = parseSettingsYaml("deploy:\n  targets:\n    prod:\n      host: a\n")
    expect(resolveSshDeploy(plain, "prod")).toEqual({ upload: [], command: "", env: {} })
  })

  test("validation", () => {
    expect(validateDeployTarget(settings, "app.example.com")).toEqual([])
    const bad = parseSettingsYaml(`
deploy:
  ssh:
    upload: [ ../secrets, "a b" ]
    env:
      "BAD-KEY": x
  targets:
    prod: {}
`)
    expect(validateDeployTarget(bad, "prod")).toEqual([
      'ssh.env key "BAD-KEY" of deploy.targets.prod is not a valid variable name',
      'ssh.upload "../secrets" of deploy.targets.prod must be a path inside the repository',
      'ssh.upload "a b" of deploy.targets.prod must not contain whitespace'
    ])
  })
})

describe("fillEnvLines", () => {
  const ctx = { vars: { REGION: "eu" }, secrets: { SENTRY_DSN: "https://k@sentry/1" } }

  test("fills references, reports secret keys, values and missing ones", () => {
    const out = fillEnvLines(
      ["# comment", "", "A=1", "DSN=${{ secrets.SENTRY_DSN }}", "R=${{ vars.REGION }}", "M=${{ secrets.NOPE }}"].join("\n"),
      ctx
    )
    expect(out.lines).toEqual(["A=1", "DSN=https://k@sentry/1", "R=eu", "M="])
    expect([...out.secretKeys]).toEqual(["DSN", "M"])
    expect(out.usedSecrets).toEqual(["https://k@sentry/1"])
    expect(out.missing).toEqual(["secrets.NOPE"])
  })

  test("keeps lines without references as they are", () => {
    expect(fillEnvLines("X=a=b\nY=", ctx).lines).toEqual(["X=a=b", "Y="])
  })

  test("rejects a multi-line value", () => {
    expect(() => fillEnvLines("K=${{ secrets.S }}", { vars: {}, secrets: { S: "a\nb" } })).toThrow("single line")
  })
})

describe("composeDeployScript command", () => {
  const base = { targetPath: "~/app", registries: ["ghcr.io"], username: "u", password: "p" }

  test("runs the command after the login, without prune/pull/up", () => {
    const script = composeDeployScript({ ...base, command: "bash deploy/deploy.sh" })
    expect(script).toContain("export DOCKER_BIN DOCKER_COMPOSE_CMD")
    expect(script.indexOf("login")).toBeLessThan(script.indexOf("bash deploy/deploy.sh"))
    expect(script).not.toContain("prune")
    expect(script).not.toContain("up -d")
  })

  test("without a command it is the generated deploy", () => {
    const script = composeDeployScript(base)
    expect(script).toContain("up -d --remove-orphans --force-recreate")
    expect(script).not.toContain("export DOCKER_BIN")
  })
})
