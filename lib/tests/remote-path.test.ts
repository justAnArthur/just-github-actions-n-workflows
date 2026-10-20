import { describe, expect, test } from "bun:test"
import { $ } from "bun"
import { remoteShellPath, scpRemotePath, singleQuote } from "../src/remote-path"
import { composeDeployScript } from "../src/compose-deploy"

async function expand(word: string): Promise<string> {
  return (await $`bash -c ${`printf %s ${word}`}`.env({ HOME: "/home/deploy", APP: "x" }).text())
}

describe("remoteShellPath", () => {
  test("expands a leading ~/ to $HOME", async () => {
    expect(await expand(remoteShellPath("~/camasys"))).toBe("/home/deploy/camasys")
    expect(await expand(remoteShellPath("~"))).toBe("/home/deploy")
  })

  test("keeps spaces in one word", async () => {
    expect(await expand(remoteShellPath("~/my app/v 2"))).toBe("/home/deploy/my app/v 2")
    expect(await expand(remoteShellPath("/srv/my app"))).toBe("/srv/my app")
  })

  test("keeps $VAR expansion of absolute paths as before", async () => {
    expect(await expand(remoteShellPath("$HOME/app"))).toBe("/home/deploy/app")
  })

  test("escapes quotes and backticks", async () => {
    expect(await expand(remoteShellPath('/srv/a"b`c`'))).toBe('/srv/a"b`c`')
  })

  test("a ~ that isn't a leading home prefix is literal", async () => {
    expect(await expand(remoteShellPath("/srv/~app"))).toBe("/srv/~app")
  })
})

describe("scpRemotePath", () => {
  test("turns ~/ into a home-relative path", () => {
    expect(scpRemotePath("~/camasys")).toBe("camasys")
    expect(scpRemotePath("~")).toBe(".")
    expect(scpRemotePath("/srv/app")).toBe("/srv/app")
  })
})

describe("singleQuote", () => {
  test("round-trips through bash", async () => {
    expect(await expand(singleQuote("p'a$s s"))).toBe("p'a$s s")
  })
})

describe("composeDeployScript", () => {
  const script = composeDeployScript({
    targetPath: "~/camasys",
    registries: ["ghcr.io", "docker.io"],
    username: "bot",
    password: "secret"
  })

  test("cds into the expanded home path", () => {
    expect(script).toContain('cd "$HOME/camasys"')
  })

  test("prunes images before the pull and never prunes volumes", () => {
    expect(script.indexOf("image prune -af")).toBeLessThan(script.indexOf("pull --ignore-pull-failures"))
    expect(script).toContain("system prune -af")
    expect(script).not.toContain("--volumes")
  })

  test("logs in to every registry without failing the deploy", () => {
    expect(script).toContain("login 'ghcr.io' -u 'bot' --password-stdin; then")
    expect(script).toContain("login 'docker.io' -u 'bot' --password-stdin; then")
    expect(script).toContain("WARNING: login to docker.io failed")
  })

  test("skips login without credentials", () => {
    expect(composeDeployScript({ targetPath: "/srv/app", registries: ["ghcr.io"] })).not.toContain("login")
  })

  test("is valid bash", async () => {
    await $`bash -n -c ${script}`
  })
})
