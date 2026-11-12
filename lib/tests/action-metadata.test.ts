import { describe, expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

// GitHub evaluates ${{ }} in an action's metadata, descriptions included: a
// reference it can't resolve there (vars, secrets) fails loading the action
const actionsDir = join(import.meta.dir, "../../actions")

describe("action.yml descriptions", () => {
  for (const name of readdirSync(actionsDir)) {
    test(name, () => {
      const action = Bun.YAML.parse(readFileSync(join(actionsDir, name, "action.yml"), "utf-8")) as any
      const descriptions = [
        action.description,
        ...Object.values(action.inputs ?? {}).map((i: any) => i?.description),
        ...Object.values(action.outputs ?? {}).map((o: any) => o?.description)
      ].filter(Boolean)
      for (const d of descriptions) expect(d).not.toContain("${{")
    })
  }
})
