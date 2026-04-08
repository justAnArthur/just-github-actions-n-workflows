#!/usr/bin/env node

// init.ts
// ---
// cli: scaffolds workflow caller files into the current repo.
// run from the root of any repo to install the toolkit's workflows.
//
// usage:
//   bunx just-github-actions-n-workflows init              # install all workflows
//   bunx just-github-actions-n-workflows init bump-version  # install specific one
//   bunx just-github-actions-n-workflows init --list        # show available workflows
//
// this creates minimal caller files in `.github/workflows/` that
// reference the reusable workflows from the toolkit repo. nothing
// else is needed — the toolkit fetches its own binaries at runtime.
// ---

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// --- workflow templates ---

const WORKFLOWS: Record<string, { file: string; description: string; content: string }> = {
  "bump-version": {
    file: "bump-version.yml",
    description: "auto-bump manifest versions using conventional commits",
    content: `name: bump-version
run-name: >-
  \${{
    github.event_name == 'workflow_dispatch'
      && format('bump-version (manual) — type={0}, stable={1}, manifests={2}',
           github.event.inputs.bump_type || '',
           github.event.inputs.bump_to_stable || '',
           github.event.inputs.bump_manifest_names || '')
      || format('bump-version (auto) — {0}',
           github.event.head_commit.message || '')
  }}

on:
  push:
    branches: ["canary", "versions/**"]
  workflow_dispatch:
    inputs:
      bump_type:
        description: 'bump type (e.g. "minor:canary", "patch:stable")'
        required: false
        default: ""
      bump_to_stable:
        description: "promote canary to stable based on history"
        required: false
        default: "false"
      bump_manifest_names:
        description: "comma-separated manifest names to bump (empty = all)"
        required: false
        default: ""

permissions:
  contents: write
  packages: write

jobs:
  bump:
    uses: justAnArthur/just-github-actions-n-workflows/.github/workflows/bump-version.yml@main
    with:
      bump_type: \${{ github.event.inputs.bump_type || '' }}
      bump_to_calculated_stable: \${{ github.event.inputs.bump_to_stable || 'false' }}
      bump_manifest_names: \${{ github.event.inputs.bump_manifest_names || '' }}
    secrets:
      GH_TOKEN: \${{ secrets.GH_TOKEN }}
`,
  },

  "publish-docker": {
    file: "publish-docker-on-tag.yml",
    description: "build + push docker image to ghcr on tag, create github release",
    content: `name: publish-docker
run-name: >-
  publish-docker
  \${{
    github.event_name == 'workflow_dispatch'
      && format('(manual) tag={0}', github.event.inputs.tag || github.ref_name)
      || format('(auto) tag={0}', github.ref_name || '')
  }}

on:
  push:
    tags: ["*@*", "*"]
  workflow_dispatch:
    inputs:
      tag:
        description: 'tag to build (e.g. "@scope/pkg@1.2.3")'
        required: false
        default: ""

permissions:
  contents: write
  packages: write

jobs:
  publish:
    uses: justAnArthur/just-github-actions-n-workflows/.github/workflows/publish-docker-on-tag.yml@main
    with:
      tag: \${{ github.event.inputs.tag || github.ref_name }}
    secrets:
      GH_TOKEN: \${{ secrets.GH_TOKEN }}
      NPM_TOKEN: \${{ secrets.NPM_TOKEN }}
`,
  },

  "publish-npm": {
    file: "publish-npm-on-tag.yml",
    description: "publish npm package on tag, create github release",
    content: `name: publish-npm
run-name: "publish-npm — \${{ github.ref_name }}"

on:
  push:
    tags: ["*@*"]
  workflow_dispatch:
    inputs:
      tag:
        description: 'tag to publish (e.g. "my-package@1.2.3")'
        required: true

permissions:
  contents: write

jobs:
  publish:
    uses: justAnArthur/just-github-actions-n-workflows/.github/workflows/publish-npm-on-tag.yml@main
    with:
      tag: \${{ github.event.inputs.tag || github.ref_name }}
    secrets:
      GH_TOKEN: \${{ secrets.GH_TOKEN }}
      NPM_TOKEN: \${{ secrets.NPM_TOKEN }}
`,
  },
};

// --- cli ---

const args = process.argv.slice(2);

// strip the "init" subcommand if present
const command = args[0];
if (command === "init") args.shift();

const flags = args.filter((a) => a.startsWith("-"));
const positional = args.filter((a) => !a.startsWith("-"));

if (flags.includes("--help") || flags.includes("-h")) {
  console.log(`
usage: bunx just-github-actions-n-workflows init [workflow...] [--list]

installs workflow caller files into .github/workflows/ of the current repo.
these reference reusable workflows from the toolkit — no binaries to copy.

examples:
  bunx just-github-actions-n-workflows init                # install all
  bunx just-github-actions-n-workflows init bump-version    # install one
  bunx just-github-actions-n-workflows init --list          # show available

available workflows:
${Object.entries(WORKFLOWS)
  .map(([name, w]) => `  ${name.padEnd(20)} ${w.description}`)
  .join("\n")}
`);
  process.exit(0);
}

if (flags.includes("--list") || flags.includes("-l")) {
  console.log("\navailable workflows:\n");
  for (const [name, w] of Object.entries(WORKFLOWS)) {
    console.log(`  ${name.padEnd(20)} → .github/workflows/${w.file}`);
    console.log(`  ${"".padEnd(20)}   ${w.description}\n`);
  }
  process.exit(0);
}

// determine which workflows to install
const selected =
  positional.length > 0
    ? positional.map((name) => {
        const key = name.replace(/\.yml$/, "");
        if (!WORKFLOWS[key]) {
          console.error(`unknown workflow: "${name}"`);
          console.error(`available: ${Object.keys(WORKFLOWS).join(", ")}`);
          process.exit(1);
        }
        return [key, WORKFLOWS[key]] as const;
      })
    : Object.entries(WORKFLOWS);

// create .github/workflows/ if needed
const workflowsDir = join(process.cwd(), ".github", "workflows");
mkdirSync(workflowsDir, { recursive: true });

// write files
let created = 0;
let skipped = 0;

for (const [name, workflow] of selected) {
  const filePath = join(workflowsDir, workflow.file);

  if (existsSync(filePath)) {
    console.log(`  skip  ${workflow.file} (already exists)`);
    skipped++;
    continue;
  }

  writeFileSync(filePath, workflow.content, "utf-8");
  console.log(`  create  .github/workflows/${workflow.file}`);
  created++;
}

console.log(`\ndone — ${created} created, ${skipped} skipped`);

if (created > 0) {
  console.log(`\nnext steps:`);
  console.log(`  1. set the GH_TOKEN secret in your repo settings`);
  console.log(`  2. commit and push: git add .github/ && git commit -m "ci: add workflows" && git push`);
}

