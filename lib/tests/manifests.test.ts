import { describe, expect, test } from "bun:test"
import type { Manifest } from "../src/manifests"
import npmAdapter from "../src/manifests/adapters/npm"
import { findManifestByName, findManifestsByScope } from "../src/manifests/discovery"

describe("npm adapter setManifestVersion", () => {
  test("ends the file with one newline", async () => {
    const updated = await npmAdapter.setManifestVersion('{\n  "version": "1.0.0"\n}\n', "1.0.1")
    expect(updated).toBe('{\n  "version": "1.0.1"\n}\n')
  })

  test("restores the newline a previous bump dropped", async () => {
    const updated = await npmAdapter.setManifestVersion('{\n  "version": "1.0.0"\n}', "1.0.1")
    expect(updated).toBe('{\n  "version": "1.0.1"\n}\n')
  })
})

function manifest(name: string, scopeAliases: string[]): Manifest {
  return {
    name,
    version: "1.0.0",
    priority: undefined,
    dockerfilePath: undefined,
    dockerContext: undefined,
    scopeAliases,
    deployTargets: []
  }
}

describe("findManifestsByScope", () => {
  // discovery order puts files first, as it did in the repo where `canvas` bumped files
  const files = manifest("@acme/files", ["files", "canvas"])
  const canvas = manifest("@acme/canvas", [])
  const agent = manifest("@acme/canvas-agent", ["canvas"])
  const manifests = [files, canvas, agent]

  test("a full name beats every alias", () => {
    expect(findManifestsByScope(manifests, "@acme/canvas")).toEqual([canvas])
  })

  test("a name without its npm scope beats an alias", () => {
    expect(findManifestsByScope(manifests, "canvas")).toEqual([canvas])
    expect(findManifestByName(manifests, "canvas")).toBe(canvas)
  })

  test("an alias names every manifest that lists it", () => {
    expect(findManifestsByScope([files, agent], "canvas")).toEqual([files, agent])
  })

  test("an unknown scope names nothing", () => {
    expect(findManifestsByScope(manifests, "docs")).toEqual([])
    expect(findManifestByName(manifests, "docs")).toBeUndefined()
  })
})
