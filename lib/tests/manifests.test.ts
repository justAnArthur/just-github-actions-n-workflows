import { describe, expect, test } from "bun:test"
import npmAdapter from "../src/manifests/adapters/npm"

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
