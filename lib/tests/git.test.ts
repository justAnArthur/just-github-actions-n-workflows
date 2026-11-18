import { describe, expect, test } from "bun:test"
import { parseCommitMessage } from "../src/git/conventional-commit-parser"

describe("parseCommitMessage", () => {
  test("parses simple conventional commit", () => {
    const result = parseCommitMessage("feat(scope): add feature")
    expect(result.items).toHaveLength(1)
    expect(result.items[0].type).toBe("feat")
    expect(result.items[0].scope).toBe("scope")
    expect(result.items[0].subject).toBe("add feature")
  })

  test("parses commit without scope", () => {
    const result = parseCommitMessage("fix: correct a typo")
    expect(result.items).toHaveLength(1)
    expect(result.items[0].type).toBe("fix")
    expect(result.items[0].scope).toBeNull()
    expect(result.items[0].subject).toBe("correct a typo")
  })

  test("extracts jira ticket ids", () => {
    const result = parseCommitMessage("feat(core): implement PROJ-123 feature")
    expect(result.jira).toContain("PROJ-123")
  })

  test("handles multi-item commit", () => {
    const result = parseCommitMessage(
      "feat(a): first\nfix(b): second"
    )
    expect(result.items).toHaveLength(2)
    expect(result.items[0].scope).toBe("a")
    expect(result.items[1].scope).toBe("b")
  })

  test("parses comma-separated scopes", () => {
    const result = parseCommitMessage("fix(cli,lib): shared fix")
    expect(result.items).toHaveLength(1)
    expect(result.items[0].scope).toBe("cli")
    expect(result.items[0].scopes).toEqual(["cli", "lib"])
  })

  test("parses single scope into scopes array", () => {
    const result = parseCommitMessage("feat(cli): add feature")
    expect(result.items[0].scope).toBe("cli")
    expect(result.items[0].scopes).toEqual(["cli"])
  })

  test("empty scopes array for scopeless commit", () => {
    const result = parseCommitMessage("fix: correct a typo")
    expect(result.items[0].scope).toBeNull()
    expect(result.items[0].scopes).toEqual([])
  })

  test("plain commit is not breaking", () => {
    expect(parseCommitMessage("feat(cli): add feature").items[0].breaking).toBe(false)
  })

  test("! before the scope is breaking", () => {
    const [item] = parseCommitMessage("feat!(cli): drop node 18").items
    expect(item).toMatchObject({ type: "feat", scope: "cli", subject: "drop node 18", breaking: true })
  })

  test("! after the scope is breaking", () => {
    const [item] = parseCommitMessage("feat(cli,lib)!: drop node 18").items
    expect(item).toMatchObject({ type: "feat", scopes: ["cli", "lib"], subject: "drop node 18", breaking: true })
  })

  test("! without a scope is breaking", () => {
    const [item] = parseCommitMessage("refactor!: drop node 18").items
    expect(item).toMatchObject({ type: "refactor", scope: null, breaking: true })
  })

  test("BREAKING CHANGE footer breaks the header item", () => {
    const parsed = parseCommitMessage(
      "feat(cli): new config format\n\nexplain why.\n\nBREAKING CHANGE: the old format is gone"
    )
    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0]).toMatchObject({ type: "feat", scope: "cli", breaking: true })
    expect(parsed.footer).toContain("BREAKING CHANGE: the old format is gone")
  })

  test("scopeless BREAKING-CHANGE footer breaks the header item, not an item of its own", () => {
    const parsed = parseCommitMessage("fix(lib): rename export\n\nBREAKING-CHANGE: renamed")
    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0]).toMatchObject({ type: "fix", scope: "lib", breaking: true })
  })

  test("footer breaks only the item it follows in a multi-item commit", () => {
    const parsed = parseCommitMessage(
      "feat(a): first\n\nBREAKING CHANGE: a changed\n\nfix(b): second"
    )
    expect(parsed.items.map((i) => [i.scope, i.breaking])).toEqual([["a", true], ["b", false]])
  })

  test("BREAKING-CHANGE(scope) body line stays a breaking item of its own", () => {
    const parsed = parseCommitMessage("feat(a): first\n\nBREAKING-CHANGE(b): b changed")
    expect(parsed.items.map((i) => [i.type, i.scope, i.breaking])).toEqual([
      ["feat", "a", false],
      ["BREAKING-CHANGE", "b", true]
    ])
  })

  test("handles non-conventional message", () => {
    const result = parseCommitMessage("just a plain commit message")
    expect(result.items).toHaveLength(0)
    expect(result.header).toBe("just a plain commit message")
  })
})

