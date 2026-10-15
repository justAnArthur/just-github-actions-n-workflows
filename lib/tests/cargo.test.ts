import { afterEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

import cargoAdapter from "../src/manifests/adapters/cargo"
import { findManifests, updateManifest } from "../src/manifests"

const tempDirs: string[] = []

afterEach(async () => {
  while (tempDirs.length) {
    await rm(tempDirs.pop()!, { recursive: true, force: true })
  }
})

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cargo-adapter-"))
  tempDirs.push(dir)
  return dir
}

async function write(p: string, content: string): Promise<string> {
  await mkdir(path.dirname(p), { recursive: true })
  await writeFile(p, content, "utf-8")
  return p
}

// --- parseManifest ---

describe("cargo adapter parseManifest", () => {
  test("workspace root with metadata", async () => {
    const manifest = await cargoAdapter.parseManifest(`
[workspace]
members = ["crates/*"]

[workspace.package]
version = "0.1.0"

[workspace.metadata.justactions]
name = "jbm"
gitCommitScopeRelatedNames = ["game", "client"]
deployTargets = "docker,vercel"
`)
    expect(manifest).toEqual({
      name: "jbm",
      version: "0.1.0",
      priority: undefined,
      dockerfilePath: undefined,
      dockerContext: undefined,
      scopeAliases: ["game", "client"],
      deployTargets: ["docker", "vercel"],
      gitCommitScopeRelatedNames: ["game", "client"]
    })
  })

  test("member crate inheriting version.workspace is null", async () => {
    const manifest = await cargoAdapter.parseManifest(`
[package]
name = "a"
version.workspace = true
`)
    expect(manifest).toBeNull()
  })

  test("virtual workspace without a name is null", async () => {
    const manifest = await cargoAdapter.parseManifest(`
[workspace]
members = ["crates/*"]

[workspace.package]
version = "0.1.0"
`)
    expect(manifest).toBeNull()
  })

  test("standalone crate uses its package name and version", async () => {
    const manifest = await cargoAdapter.parseManifest(`
[package]
name = "solo"
version = "0.3.2"
`)
    expect(manifest).not.toBeNull()
    expect(manifest!.name).toBe("solo")
    expect(manifest!.version).toBe("0.3.2")
  })

  test("metadata name overrides package name", async () => {
    const manifest = await cargoAdapter.parseManifest(`
[package]
name = "real-name"
version = "1.0.0"

[package.metadata.justactions]
name = "pretty-name"
`)
    expect(manifest).not.toBeNull()
    expect(manifest!.name).toBe("pretty-name")
    expect(manifest!.version).toBe("1.0.0")
  })

  test("deploy targets are inferred from dockerfilePath and vercelProjectId", async () => {
    const manifest = await cargoAdapter.parseManifest(`
[package]
name = "solo"
version = "1.0.0"

[package.metadata.justactions]
dockerfilePath = "Dockerfile"
vercelProjectId = "proj"
`)
    expect(manifest!.deployTargets).toEqual(["docker", "vercel"])
    expect(manifest!.dockerfilePath).toBe("Dockerfile")
  })
})

// --- setManifestVersion ---

describe("cargo adapter setManifestVersion", () => {
  const rootToml = `[workspace]
resolver = "3"
members = ["crates/*"]

[workspace.package]
version = "0.0.0" # bumped by ci
edition = "2024"
publish = false

[workspace.metadata.justactions]
name = "jbm"
gitCommitScopeRelatedNames = ["game", "client"]

[workspace.dependencies]
jbm-core = { path = "crates/core" }
serde = { version = "=1.0.229", features = ["derive"] }
winit = "0.30"
`

  test("edits only the [workspace.package] version line", async () => {
    const updated = await cargoAdapter.setManifestVersion(rootToml, "0.1.0")
    expect(updated).toBe(`[workspace]
resolver = "3"
members = ["crates/*"]

[workspace.package]
version = "0.1.0" # bumped by ci
edition = "2024"
publish = false

[workspace.metadata.justactions]
name = "jbm"
gitCommitScopeRelatedNames = ["game", "client"]

[workspace.dependencies]
jbm-core = { path = "crates/core" }
serde = { version = "=1.0.229", features = ["derive"] }
winit = "0.30"
`)
  })

  test("edits the [package] version without touching dependencies", async () => {
    const updated = await cargoAdapter.setManifestVersion(
      `[package]
name = "b"
version = "0.0.0"
edition = "2024"

[dependencies]
foo = { version = "1" }
`,
      "0.2.0"
    )
    expect(updated).toBe(`[package]
name = "b"
version = "0.2.0"
edition = "2024"

[dependencies]
foo = { version = "1" }
`)
  })

  test("throws when the target table has no version line", async () => {
    await expect(
      cargoAdapter.setManifestVersion(
        `[package]
name = "b"
edition = "2024"
`,
        "1.0.0"
      )
    ).rejects.toThrow(/version/)
  })
})

// --- end-to-end: updateManifest + findManifests + Cargo.lock ---

describe("cargo adapter end-to-end", () => {
  const lockBefore = `version = 3

[[package]]
name = "a"
version = "0.0.0"

[[package]]
name = "b"
version = "0.0.0"

[[package]]
name = "c"
version = "0.0.0"

[[package]]
name = "zz"
version = "0.0.0"
source = "registry+https://github.com/rust-lang/crates.io-index"
`

  const lockAfterA = lockBefore.replace(
    '[[package]]\nname = "a"\nversion = "0.0.0"',
    '[[package]]\nname = "a"\nversion = "0.1.0"'
  )

  const lockAfterB = lockAfterA.replace(
    '[[package]]\nname = "b"\nversion = "0.0.0"',
    '[[package]]\nname = "b"\nversion = "0.2.0"'
  )

  async function makeWorkspace(): Promise<string> {
    const dir = await makeTempDir()
    // the .git marker stops the Cargo.lock walk-up at the workspace root
    await mkdir(path.join(dir, ".git"), { recursive: true })
    await write(
      path.join(dir, "Cargo.toml"),
      `[workspace]
members = ["crates/*"]

[workspace.package]
version = "0.0.0"

[workspace.metadata.justactions]
name = "jbm"
gitCommitScopeRelatedNames = ["game", "client"]
`
    )
    await write(
      path.join(dir, "crates", "a", "Cargo.toml"),
      `[package]
name = "a"
version.workspace = true
`
    )
    await write(
      path.join(dir, "crates", "b", "Cargo.toml"),
      `[package]
name = "b"
version = "0.0.0"
`
    )
    await write(
      path.join(dir, "vendor", "other", "Cargo.toml"),
      `[workspace]
members = ["crates/*"]
`
    )
    await write(
      path.join(dir, "vendor", "other", "crates", "c", "Cargo.toml"),
      `[package]
name = "c"
version.workspace = true
`
    )
    await write(path.join(dir, "Cargo.lock"), lockBefore)
    return dir
  }

  test("bumping the workspace root syncs inherited crates in Cargo.lock", async () => {
    const dir = await makeWorkspace()
    const rootManifest = path.join(dir, "Cargo.toml")

    await updateManifest(rootManifest, "0.1.0")

    expect(await readFile(path.join(dir, "Cargo.lock"), "utf-8")).toBe(lockAfterA)
    expect(await readFile(rootManifest, "utf-8")).toContain('version = "0.1.0"')
  })

  test("findManifests returns only the workspace module and the literal-version crate", async () => {
    const dir = await makeWorkspace()

    const found = await findManifests(dir)
    expect(found.map((m) => m.name).sort()).toEqual(["b", "jbm"])

    const jbm = found.find((m) => m.name === "jbm")!
    expect(jbm.path).toBe(path.join(dir, "Cargo.toml"))
    expect(jbm.version).toBe("0.0.0")
  })

  test("bumping a single crate updates only that crate in Cargo.lock", async () => {
    const dir = await makeWorkspace()
    const rootManifest = path.join(dir, "Cargo.toml")
    const bManifest = path.join(dir, "crates", "b", "Cargo.toml")

    await updateManifest(rootManifest, "0.1.0")
    await updateManifest(bManifest, "0.2.0")

    expect(await readFile(path.join(dir, "Cargo.lock"), "utf-8")).toBe(lockAfterB)
    expect(await readFile(bManifest, "utf-8")).toContain('version = "0.2.0"')
  })
})
