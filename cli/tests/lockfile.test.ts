import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdirSync, rmSync } from "node:fs"
import { join } from "node:path"

import { lockfilePath, readLockfile, writeLockfile, type Lockfile } from "../src/lockfile.js"

const TMP = join(process.cwd(), ".tmp-lockfile-test")

beforeEach(() => {
  rmSync(TMP, { recursive: true, force: true })
  mkdirSync(TMP, { recursive: true })
  mkdirSync(join(TMP, ".github", "workflows"), { recursive: true })
})

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true })
})

describe("lockfilePath", () => {
  test("returns <cwd>/.github/workflows/.toolkit-lock.json", () => {
    expect(lockfilePath(TMP)).toBe(join(TMP, ".github", "workflows", ".toolkit-lock.json"))
  })

  test("isolates per-cwd paths — two different cwd values produce different paths", () => {
    const other = join(process.cwd(), ".tmp-lockfile-test-other")
    mkdirSync(other, { recursive: true })
    try {
      expect(lockfilePath(TMP)).not.toBe(lockfilePath(other))
    } finally {
      rmSync(other, { recursive: true, force: true })
    }
  })
})

describe("readLockfile / writeLockfile", () => {
  test("readLockfile returns null when the lockfile does not exist at <cwd>", () => {
    expect(readLockfile(TMP)).toBeNull()
  })

  test("writeLockfile + readLockfile round-trip a Lockfile at <cwd>", () => {
    const lock: Lockfile = {
      ref: "v1.0.1",
      installedAt: "2026-09-15T00:00:00.000Z",
      workflows: {
        "bump-version.yml": {
          name: "bump-version",
          file: "bump-version.yml",
          ref: "v1.0.1",
          installedAt: "2026-09-15T00:00:00.000Z"
        }
      }
    }

    writeLockfile(lock, TMP)
    const back = readLockfile(TMP)

    expect(back).not.toBeNull()
    expect(back?.ref).toBe("v1.0.1")
    expect(back?.workflows["bump-version.yml"].name).toBe("bump-version")
  })

  test("writeLockfile scopes output to the given cwd — does not touch process.cwd()", () => {
    const lock: Lockfile = {
      ref: "v1.0.1",
      installedAt: "2026-09-15T00:00:00.000Z",
      workflows: {}
    }

    writeLockfile(lock, TMP)

    // The lockfile should be at <TMP>/.github/workflows/.toolkit-lock.json,
    // not at the test process's cwd.
    const expectedPath = join(TMP, ".github", "workflows", ".toolkit-lock.json")
    expect(readLockfile(TMP)).not.toBeNull()

    // Sanity: confirm the path resolves through TMP, not process.cwd().
    // If writeLockfile leaked to process.cwd(), the round-trip would still
    // pass via the same path, so this assertion is the real check.
    const other = join(process.cwd(), ".tmp-lockfile-test-other-dir")
    mkdirSync(join(other, ".github", "workflows"), { recursive: true })
    try {
      writeLockfile({ ...lock, ref: "v2.0.0" }, other)
      expect(readLockfile(other)?.ref).toBe("v2.0.0")
      expect(readLockfile(TMP)?.ref).toBe("v1.0.1")
    } finally {
      rmSync(other, { recursive: true, force: true })
    }
  })

  test("readLockfile returns null on malformed JSON instead of throwing", () => {
    const path = lockfilePath(TMP)
    require("node:fs").writeFileSync(path, "{ this is not json")
    expect(readLockfile(TMP)).toBeNull()
  })
})
