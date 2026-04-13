import { Args, Command, Flags, ux } from "@oclif/core"
import { checkbox, select } from "@inquirer/prompts"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import {
  enrichWorkflows,
  fetchSettingsTemplate,
  fetchTags,
  fetchWorkflowContent,
  fetchWorkflowList,
  resolveRefSha,
  REPO,
  SETTINGS_FILENAME,
  type VersionTag,
  type WorkflowEntry
} from "../github.js"
import { injectRefComment, mergeLockfile, readLockfile, writeLockfile } from "../lockfile.js"

export default class Init extends Command {
  static override description = "Scaffold workflow files into .github/workflows/ of the current repo"

  static override examples = [
    "<%= config.bin %> init",
    "<%= config.bin %> init bump-version",
    "<%= config.bin %> init --ref v1.0.0",
    "<%= config.bin %> init --list",
    "<%= config.bin %> init --yes --force"
  ]

  static override args = {
    workflows: Args.string({
      description: "Specific workflow names to install (space-separated)",
      required: false
    })
  }

  static override strict = false

  static override flags = {
    list: Flags.boolean({
      char: "l",
      description: "Show available workflows",
      default: false
    }),
    force: Flags.boolean({
      char: "f",
      description: "Overwrite existing workflow files",
      default: false
    }),
    yes: Flags.boolean({
      char: "y",
      description: "Skip interactive prompts, install all workflows",
      default: false
    }),
    ref: Flags.string({
      description: "Git ref to fetch from (tag, branch, or sha). Defaults to 'main'."
    }),
    "no-settings": Flags.boolean({
      description: "Skip creating the .justactions.yml settings file",
      default: false
    })
  }

  async run(): Promise<void> {
    const { argv, flags } = await this.parse(Init)
    const positional = argv as string[]

    // --- list mode ---

    if (flags.list) {
      const ref = flags.ref ?? "main"
      await this.listWorkflows(ref)
      return
    }

    // --- interactive / install mode ---

    this.log()
    this.log(ux.colorize("bold", "  just-github-actions-n-workflows"))
    this.log(ux.colorize("dim", "  release automation toolkit\n"))

    const tags = await fetchTags()
    const ref = await this.resolveRef(flags, positional, tags)
    const selected = await this.selectWorkflows(ref, flags, positional)

    if (selected.length === 0) {
      this.log(ux.colorize("yellow", "\n  no workflows selected — nothing to do.\n"))
      return
    }

    // resolve tag → commit SHA for safe `uses:` refs
    const sha = await resolveRefSha(ref)
    if (sha !== ref) {
      this.log(ux.colorize("dim", `  resolved ${ref} → ${sha.slice(0, 12)}\n`))
    }

    const { created, skipped } = await this.installWorkflows(selected, ref, sha, flags)

    // --- scaffold .justactions.yml ---

    if (!flags["no-settings"]) {
      await this.scaffoldSettings(ref, flags)
    }

    this.log(`\n  done — ${ux.colorize("green", `${created} created`)}, ${skipped} skipped\n`)

    this.printSecretsReminder(selected)
    this.printNextSteps(created, selected)
  }

  // ── step 1: resolve ref ────────────────────────────────

  private async resolveRef(
    flags: { ref?: string; yes: boolean },
    positional: string[],
    tags: VersionTag[]
  ): Promise<string> {
    if (flags.ref) {
      return flags.ref
    }

    // default to "main" when no tags exist
    if (tags.length === 0) {
      if (positional.length > 0 || flags.yes) {
        return "main"
      }
      this.log(ux.colorize("yellow", "  no published versions found — using 'main' branch\n"))
      return "main"
    }

    const latest = tags[0].tag

    if (positional.length > 0 || flags.yes) {
      return latest
    }

    this.log(ux.colorize("bold", "  step 1 — select version\n"))

    const choices = [
      ...tags.slice(0, 10).map((t, i) => ({
        name: i === 0
          ? `${t.version} ${ux.colorize("dim", "(latest tag)")}`
          : t.version,
        value: t.tag
      }))
    ]

    const ref = await select({
      message: "Pick a version",
      choices,
      default: "main"
    })

    this.log(ux.colorize("green", `\n  → using ${ref}\n`))
    return ref
  }

  // ── step 2: select workflows ───────────────────────────

  private async selectWorkflows(
    ref: string,
    flags: { yes: boolean },
    positional: string[]
  ): Promise<WorkflowEntry[]> {
    let available = await fetchWorkflowList(ref)
    available = await enrichWorkflows(available, ref)

    if (available.length === 0) {
      this.error(`No workflows found at ref "${ref}". Try --ref main or a different version.`)
    }

    if (positional.length > 0) {
      return positional.map((name) => {
        const key = name.replace(/\.yml$/, "")
        const wf = available.find((w) => w.name === key)
        if (!wf) {
          this.error(`Unknown workflow "${name}". Available: ${available.map((w) => w.name).join(", ")}`)
        }
        return wf!
      })
    }

    if (flags.yes) return available

    this.log(ux.colorize("bold", "  step 2 — select workflows\n"))

    const selected = await checkbox({
      message: "Select workflows to install",
      choices: available.map((wf) => {
        const secretNames = wf.secrets?.map((s) => s.split(/\s+[—–]\s*/)[0]).join(", ")
        const hint = [
          wf.description,
          secretNames ? `requires: ${secretNames}` : null
        ].filter(Boolean).join(" · ")

        return {
          name: `${wf.name.padEnd(26)} ${ux.colorize("dim", hint || wf.file)}`,
          value: wf.name,
          checked: false
        }
      })
    })

    return available.filter((w) => selected.includes(w.name))
  }

  // ── step 3: install ────────────────────────────────────

  private async installWorkflows(
    selected: WorkflowEntry[],
    ref: string,
    sha: string,
    flags: { force: boolean; yes: boolean }
  ): Promise<{ created: number; skipped: number }> {
    const targetDir = join(process.cwd(), ".github", "workflows")
    mkdirSync(targetDir, { recursive: true })

    if (!flags.yes) {
      this.log(ux.colorize("bold", "  step 3 — install\n"))
    }

    this.log(ux.colorize("dim", `  fetching from ${REPO} @ ${ref}\n`))

    let created = 0
    let skipped = 0
    const installed: { name: string; file: string }[] = []

    for (const workflow of selected) {
      const targetPath = join(targetDir, workflow.file)

      if (!flags.force && existsSync(targetPath)) {
        this.log(`  ${ux.colorize("yellow", "skip")}    ${workflow.file} ${ux.colorize("dim", "(already exists, use --force)")}`)
        skipped++
        continue
      }

      try {
        let content = await fetchWorkflowContent(workflow.file, ref)
        content = injectRefComment(content, ref, sha)
        writeFileSync(targetPath, content, "utf-8")
        this.log(`  ${ux.colorize("green", "create")}  .github/workflows/${workflow.file}`)
        installed.push({ name: workflow.name, file: workflow.file })
        created++
      } catch (error: any) {
        this.log(`  ${ux.colorize("red", "error")}   ${workflow.file}: ${error.message}`)
      }
    }

    // --- write lock file ---

    if (installed.length > 0) {
      const existing = readLockfile()
      const lock = mergeLockfile(existing, ref, installed)
      writeLockfile(lock)
      this.log(ux.colorize("dim", `\n  lock file written → .github/workflows/.toolkit-lock.json`))
    }

    return { created, skipped }
  }

  // ── scaffold .justactions.yml ──────────────────────────

  private async scaffoldSettings(
    ref: string,
    flags: { force: boolean }
  ): Promise<void> {
    const targetPath = join(process.cwd(), SETTINGS_FILENAME)

    if (!flags.force && existsSync(targetPath)) {
      this.log(`  ${ux.colorize("yellow", "skip")}    ${SETTINGS_FILENAME} ${ux.colorize("dim", "(already exists)")}`)
      return
    }

    const template = await fetchSettingsTemplate(ref)

    if (template) {
      writeFileSync(targetPath, template, "utf-8")
      this.log(`  ${ux.colorize("green", "create")}  ${SETTINGS_FILENAME}`)
    } else {
      // fallback: write a minimal template if the remote file doesn't exist at this ref
      const fallback = [
        "# .justactions.yml",
        "# ---",
        "# project settings for just-github-actions-n-workflows.",
        "# configure deploy targets, module overrides, and workflow settings.",
        "# see https://github.com/justAnArthur/just-github-actions-n-workflows",
        "# ---",
        "",
        "# deploy:",
        "#   ssh_target_path: ~/my-app",
        "#   targets:",
        "#     production:",
        "#       host: app.example.com",
        "#       compose_profiles: \"@scope/backend,@scope/frontend\"",
        "#       profiles: \"prod\"",
        "#       timezone: Europe/Bratislava",
        "",
        "# modules:",
        "#   overrides:",
        "#     - name: \"@scope/backend\"",
        "#       docker_compose_service: backend",
        "",
        "# git:",
        "#   co_author_email: your-email@example.com",
        ""
      ].join("\n")

      writeFileSync(targetPath, fallback, "utf-8")
      this.log(`  ${ux.colorize("green", "create")}  ${SETTINGS_FILENAME}`)
    }
  }

  // ── step 4: secrets reminder ───────────────────────────

  private printSecretsReminder(selected: WorkflowEntry[]): void {
    const allSecrets = new Map<string, string>()
    for (const wf of selected) {
      for (const s of wf.secrets || []) {
        const [name, ...descParts] = s.split(/\s+[—–]\s*/)
        if (name && !allSecrets.has(name.trim())) {
          allSecrets.set(name.trim(), descParts.join(" — ").trim())
        }
      }
    }

    if (allSecrets.size === 0) return

    this.log(ux.colorize("bold", "  required secrets:\n"))
    for (const [name, desc] of allSecrets) {
      this.log(`  • ${ux.colorize("cyan", name.padEnd(18))} ${ux.colorize("dim", desc)}`)
    }
    this.log(ux.colorize("dim", `\n  set these in your repo → Settings → Secrets → Actions\n`))
  }

  // ── next steps ─────────────────────────────────────────

  private printNextSteps(created: number, selected: WorkflowEntry[]): void {
    if (created === 0) return

    const hasSecrets = selected.some((w) => w.secrets && w.secrets.length > 0)

    this.log(ux.colorize("bold", "  next steps:\n"))
    this.log(`  1. ${hasSecrets ? "set the secrets listed above" : "set the GH_TOKEN secret in your repo settings"}`)
    this.log(`  2. adjust push.branches / push.tags triggers for your repo`)
    this.log(`  3. configure .justactions.yml with your deploy targets (if using deploy workflow)`)
    this.log(`  4. commit and push:`)
    this.log(ux.colorize("dim", `     git add .github/ .justactions.yml && git commit -m "ci: add workflows" && git push`))
    this.log()
  }

  // ── list mode ──────────────────────────────────────────

  private async listWorkflows(ref: string): Promise<void> {
    const workflows = await enrichWorkflows(await fetchWorkflowList(ref), ref)

    this.log(`\n${ux.colorize("bold", "available workflows")} ${ux.colorize("dim", `(${REPO} @ ${ref})`)}\n`)

    for (const w of workflows) {
      this.log(`  ${ux.colorize("cyan", w.name.padEnd(28))} → .github/workflows/${w.file}`)
      if (w.description) {
        this.log(`  ${"".padEnd(28)}   ${ux.colorize("dim", w.description)}`)
      }
      if (w.secrets?.length) {
        const names = w.secrets.map((s) => s.split(/\s+[—–]\s*/)[0]).join(", ")
        this.log(`  ${"".padEnd(28)}   ${ux.colorize("dim", `secrets: ${names}`)}`)
      }
      this.log()
    }
  }
}

