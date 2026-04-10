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

  test("handles non-conventional message", () => {
    const result = parseCommitMessage("just a plain commit message")
    expect(result.items).toHaveLength(0)
    expect(result.header).toBe("just a plain commit message")
  })
})

