import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { existsSync, lstatSync, mkdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import {
  AGENTS_FILE,
  AGENTS_REL_PATH,
  ensureAgentsLink
} from "../src/lockfile.js"

const TMP = join(process.cwd(), ".tmp-agents-test")

beforeEach(() => {
  rmSync(TMP, { recursive: true, force: true })
  mkdirSync(TMP, { recursive: true })
})

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true })
})

describe("AGENTS.md scaffolding constants", () => {
  test("AGENTS_FILE is the root-level symlink name", () => {
    expect(AGENTS_FILE).toBe("AGENTS.md")
  })

  test("AGENTS_REL_PATH points into .github/", () => {
    expect(AGENTS_REL_PATH).toBe(".github/AGENTS.md")
  })
})

describe("ensureAgentsLink", () => {
  test("creates symlink when no file exists", () => {
    const result = ensureAgentsLink(TMP, { force: false })
    expect(result).toBe("created")

    const linkPath = join(TMP, AGENTS_FILE)
    expect(lstatSync(linkPath).isSymbolicLink()).toBe(true)
  })

  test("skips when a real file exists at root (not a symlink)", () => {
    const realFile = join(TMP, AGENTS_FILE)
    writeFileSync(realFile, "# my custom agents doc\n")

    const result = ensureAgentsLink(TMP, { force: false })
    expect(result).toBe("skipped-exists")

    expect(lstatSync(realFile).isSymbolicLink()).toBe(false)
  })

  test("replaces real file with symlink when force=true", () => {
    const realFile = join(TMP, AGENTS_FILE)
    writeFileSync(realFile, "# stale\n")

    const result = ensureAgentsLink(TMP, { force: true })
    expect(result).toBe("created")
    expect(lstatSync(realFile).isSymbolicLink()).toBe(true)
  })

  test("recreates symlink if previously deleted", () => {
    ensureAgentsLink(TMP, { force: false })
    unlinkSync(join(TMP, AGENTS_FILE))

    const result = ensureAgentsLink(TMP, { force: false })
    expect(result).toBe("created")
    expect(lstatSync(join(TMP, AGENTS_FILE)).isSymbolicLink()).toBe(true)
  })

  test("replaces misdirected symlink (different target) when force=true", () => {
    const stale = join(TMP, AGENTS_FILE)
    symlinkSync("somewhere/else.md", stale)

    const result = ensureAgentsLink(TMP, { force: true })
    expect(result).toBe("created")
    expect(lstatSync(stale).isSymbolicLink()).toBe(true)
  })

  test("does nothing if AGENTS.md symlink already points correctly", () => {
    ensureAgentsLink(TMP, { force: false })
    const result = ensureAgentsLink(TMP, { force: false })
    expect(result).toBe("unchanged")
    expect(lstatSync(join(TMP, AGENTS_FILE)).isSymbolicLink()).toBe(true)
  })
})
