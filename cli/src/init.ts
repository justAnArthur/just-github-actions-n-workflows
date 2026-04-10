#!/usr/bin/env node

// init.ts
// ---
// cli: scaffolds workflow files into the current repo.
// run from the root of any repo to install the toolkit's workflows.
//
// usage:
//   bunx just-github-actions-n-workflows init              # install all workflows
//   bunx just-github-actions-n-workflows init bump-version  # install specific one
//   bunx just-github-actions-n-workflows init --list        # show available workflows
//
// fetches the actual workflow files from the github repo
// (pinned to the installed package version) and writes them
// into `.github/workflows/`.
// ---

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

// --- constants ---

const REPO = "justAnArthur/just-github-actions-n-workflows"
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}`

// resolve installed package version → git ref
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8"))
const version: string = pkg.version || "main"
const ref = version === "0.0.0" ? "main" : `${pkg.name}@${version}`

// --- workflow registry ---

const WORKFLOWS: Record<string, { file: string; description: string }> = {
  "bump-version": {
    file: "bump-version.yml",
    description: "auto-bump manifest versions using conventional commits"
  },
  "publish-npm": {
    file: "publish-npm-on-tag.yml",
    description: "publish npm package + github release on version tag"
  },
  "publish-docker": {
    file: "publish-docker-on-tag.yml",
    description: "build + push docker image to ghcr + github release on tag"
  },
  "deploy-to-vps": {
    file: "deploy-to-vps.yml",
    description: "deploy docker compose services to a VPS (example)"
  }
}

// --- fetch a workflow file from github ---

async function fetchWorkflow(file: string, gitRef: string): Promise<string> {
  // try the version tag first, fall back to main
  for (const r of [gitRef, "main"]) {
    const url = `${RAW_BASE}/${r}/workflows/${file}`
    const res = await fetch(url)
    if (res.ok) return await res.text()
  }

  throw new Error(`failed to fetch workflows/${file} from ${REPO} (tried ref: ${gitRef}, main)`)
}

// --- cli ---

const args = process.argv.slice(2)

if (args[0] === "init") args.shift()

const flags = args.filter((a) => a.startsWith("-"))
const positional = args.filter((a) => !a.startsWith("-"))

if (flags.includes("--help") || flags.includes("-h")) {
  console.log(`
usage: bunx just-github-actions-n-workflows init [workflow...] [--list]

scaffolds workflow files into .github/workflows/ of the current repo.
fetches from github.com/${REPO} @ ${ref}

each workflow is self-contained — just adjust the triggers for your repo.

examples:
  bunx just-github-actions-n-workflows init                # install all
  bunx just-github-actions-n-workflows init bump-version    # install one
  bunx just-github-actions-n-workflows init --list          # show available

available workflows:
${Object.entries(WORKFLOWS)
    .map(([name, w]) => `  ${name.padEnd(20)} ${w.description}`)
    .join("\n")}
`)
  process.exit(0)
}

if (flags.includes("--list") || flags.includes("-l")) {
  console.log("\navailable workflows:\n")
  for (const [name, w] of Object.entries(WORKFLOWS)) {
    console.log(`  ${name.padEnd(20)} → .github/workflows/${w.file}`)
    console.log(`  ${"".padEnd(20)}   ${w.description}\n`)
  }
  process.exit(0)
}

// determine which workflows to install
const selected =
  positional.length > 0
    ? positional.map((name) => {
      const key = name.replace(/\.yml$/, "")
      if (!WORKFLOWS[key]) {
        console.error(`unknown workflow: "${name}"`)
        console.error(`available: ${Object.keys(WORKFLOWS).join(", ")}`)
        process.exit(1)
      }
      return [key, WORKFLOWS[key]] as const
    })
    : Object.entries(WORKFLOWS)

// create .github/workflows/ if needed
const targetDir = join(process.cwd(), ".github", "workflows")
mkdirSync(targetDir, { recursive: true })

console.log(`fetching workflows from ${REPO} @ ${ref}\n`)

// fetch and write files
let created = 0
let skipped = 0

for (const [_name, workflow] of selected) {
  const targetPath = join(targetDir, workflow.file)

  if (existsSync(targetPath)) {
    console.log(`  skip    ${workflow.file} (already exists)`)
    skipped++
    continue
  }

  try {
    const content = await fetchWorkflow(workflow.file, ref)
    writeFileSync(targetPath, content, "utf-8")
    console.log(`  create  .github/workflows/${workflow.file}`)
    created++
  } catch (err: any) {
    console.error(`  error   ${workflow.file}: ${err.message}`)
  }
}

console.log(`\ndone — ${created} created, ${skipped} skipped`)

if (created > 0) {
  console.log(`\nnext steps:`)
  console.log(`  1. set the GH_TOKEN secret in your repo settings`)
  console.log(`  2. adjust push.branches / push.tags triggers for your repo`)
  console.log(`  3. commit and push: git add .github/ && git commit -m "ci: add workflows" && git push`)
}
