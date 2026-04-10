// build.ts
// ---
// validates that every action package has the required files.
// there is nothing to compile — actions run via `bun run` in composite actions.
//
import { existsSync } from "node:fs"
import { join } from "node:path"
import { Glob } from "bun"

const ACTIONS_DIR = "./actions"
const REQUIRED_FILES = ["action.yml", "package.json", "tsconfig.json", join("src", "index.ts")]

const glob = new Glob("*/action.yml")
const actions: string[] = []

for await (const file of glob.scan(ACTIONS_DIR)) {
  actions.push(file.split(/[/\\]/)[0])
}

if (actions.length === 0) {
  console.error("no actions found in actions/")
  process.exit(1)
}

console.log(`found ${actions.length} action(s) to validate:\n`)

let errors = 0

for (const name of actions.sort()) {
  const missing = REQUIRED_FILES.filter(
    (f) => !existsSync(join(ACTIONS_DIR, name, f))
  )

  if (missing.length > 0) {
    console.log(`  ✗ ${name}  — missing: ${missing.join(", ")}`)
    errors++
  } else {
    console.log(`  ✓ ${name}`)
  }
}

console.log(`\n${actions.length} action(s), ${errors} with errors`)

if (errors > 0) {
  process.exit(1)
}
