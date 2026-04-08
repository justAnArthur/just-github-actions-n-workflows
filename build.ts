// build.ts
// ---
// compiles every step script into a standalone linux binary.
// only top-level `.ts` files in `steps/` are compiled (not `_lib/`).
//
import { $, Glob } from "bun"
import { mkdirSync } from "node:fs"
import { basename } from "node:path"

const STEPS_DIR = "./steps"
const OUT_DIR = "./dist"

// --- collect step entry points ---

mkdirSync(OUT_DIR, { recursive: true })

const glob = new Glob("*.ts")
const entries: string[] = []
for await (const file of glob.scan(STEPS_DIR)) {
  entries.push(file)
}

if (entries.length === 0) {
  console.error("no step scripts found in steps/")
  process.exit(1)
}

console.log(`found ${entries.length} step(s) to compile:\n`)

// --- compile each step to a standalone binary ---

for (const file of entries) {
  const name = basename(file, ".ts")
  const src = `${STEPS_DIR}/${file}`
  const out = `${OUT_DIR}/${name}`

  console.log(`  ${src}  →  ${out}`)
  await $`bun build --compile --target=bun-linux-x64 ${src} --outfile ${out}`
}

// --- summary ---

console.log(`\ndone — ${entries.length} binaries compiled to ${OUT_DIR}/`)
console.log(`  ${entries.map((f) => basename(f, ".ts")).join(", ")}`)
