import { describe, expect, test } from "bun:test"
import type { Manifest } from "../src/manifests"
import { SEMVER } from "../src/version/calculate-semver"
import { collectPushBumps } from "../src/version/push-bumps"

function manifest(name: string, version?: string): Manifest {
  return {
    name,
    version: version as string,
    priority: undefined,
    dockerfilePath: undefined,
    dockerContext: undefined,
    scopeAliases: [],
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
})
