import { describe, expect, test } from "bun:test"
import type { Manifest } from "../src/manifests"
import { SEMVER } from "../src/version/calculate-semver"
import { collectPushBumps } from "../src/version/push-bumps"

function manifest(name: string, version?: string, scopeAliases: string[] = []): Manifest {
  return {
    name,
    version: version as string,
    priority: undefined,
    dockerfilePath: undefined,
    dockerContext: undefined,
    scopeAliases,
    deployTargets: []
  }
}

const docs = manifest("@camasys/frontend_docs")
const app = manifest("@camasys/frontend", "1.4.0-canary.2")

describe("collectPushBumps", () => {
  test("skips a manifest without a version instead of bumping it", () => {
    const { bumps, unversioned } = collectPushBumps(
      ["docs(@camasys/frontend_docs): align dealer-facing manual pages with the app (#378)"],
      [docs, app]
    )
    expect(bumps.size).toBe(0)
    expect(unversioned).toEqual([docs])
  })

  test("still bumps versioned manifests named in the same push", () => {
    const { bumps, unversioned } = collectPushBumps(
      [
        "docs(@camasys/frontend_docs): manual pages",
        "feat(@camasys/frontend): dealer view",
        "fix(@camasys/frontend_docs,@camasys/frontend): typo"
      ],
      [docs, app]
    )
    expect([...bumps]).toEqual([[app, SEMVER.MINOR]])
    expect(unversioned).toEqual([docs])
  })

  test("a scope another manifest lists as an alias bumps the package it names", () => {
    const files = manifest("@acme/files", "0.11.0", ["files", "canvas"])
    const canvas = manifest("@acme/canvas", "0.9.0", ["canvas"])
    const agent = manifest("@acme/canvas-agent", "0.4.0", ["canvas-agent", "canvas"])
    const { bumps } = collectPushBumps(["feat(canvas): agent sheet (#213)"], [files, canvas, agent])
    expect([...bumps]).toEqual([[canvas, SEMVER.MINOR]])
  })

  test("an alias only shared manifests list bumps each of them", () => {
    const playbook = manifest("@acme/playbook", "0.3.0", ["playbook", "extension"])
    const product = manifest("@acme/product", "0.2.0", ["product", "extension"])
    const { bumps } = collectPushBumps(["fix(extension): typo"], [playbook, product])
    expect([...bumps]).toEqual([
      [playbook, SEMVER.PATCH],
      [product, SEMVER.PATCH]
    ])
  })
})
