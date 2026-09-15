import { Command, Flags, ux } from "@oclif/core"
import { confirm } from "@inquirer/prompts"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join, resolve as resolvePath } from "node:path"

import {
  AGENTS_TEMPLATE_PATH,
  REPO,
  fetchAgentsTemplate,
  fetchTags,
  fetchWorkflowContent,
  resolveRefSha,
} from "../github.js"
import {
  AGENTS_FILE,
  AGENTS_REL_PATH,
  ensureAgentsLink,
  injectRefComment,
  mergeLockfile,
  readLockfile,
  writeLockfile,
  type LockEntry,
} from "../lockfile.js"

export default class Update extends Command {
  static override description = "Update installed workflows to a newer version"

  static override examples = [
    "<%= config.bin %> update",
    "<%= config.bin %> update --ref v2.0.0",
    "<%= config.bin %> update --yes",
    "<%= config.bin %> update --cwd /path/to/target-repo --yes",
  ]

  static override flags = {
    ref: Flags.string({
      description: "Target git ref to update to (branch, tag, or sha)",
    }),
    yes: Flags.boolean({
      char: "y",
      description: "Skip confirmation prompt",
      default: false,
    }),
    cwd: Flags.string({
      description: "Target repo directory. Defaults to the current working directory.",
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Update)
    const cwd = this.resolveCwd(flags.cwd)

    const lock = readLockfile(cwd)

    if (!lock || Object.keys(lock.workflows).length === 0) {
      this.error(
        "No .toolkit-lock.json found. Run `init` first to install workflows.",
        { exit: 1 }
      )
    }

    const tags = await fetchTags()
    const targetRef = flags.ref ?? (tags.length > 0 ? tags[0].tag : null)

    if (!targetRef) {
      this.error("No published versions found.", { exit: 1 })
    }

    const entries = Object.values(lock.workflows)

    this.log()
    this.log(ux.colorize("bold", "  workflow update check"))
    this.log(ux.colorize("dim", `  target: ${targetRef}\n`))

    const outdated: LockEntry[] = []
    const upToDate: LockEntry[] = []

    for (const entry of entries) {
      if (entry.ref === targetRef) {
        upToDate.push(entry)
      } else {
        outdated.push(entry)
      }
    }

    for (const entry of entries) {
      const current = entry.ref === targetRef
      const icon = current ? ux.colorize("green", "✓") : ux.colorize("yellow", "⬆")
      const refLabel = current
        ? ux.colorize("green", entry.ref)
        : `${ux.colorize("yellow", entry.ref)} → ${ux.colorize("green", targetRef)}`

      this.log(`  ${icon} ${ux.colorize("cyan", entry.name.padEnd(28))} ${refLabel}`)
    }

    this.log()

    if (outdated.length === 0) {
      this.log(ux.colorize("green", `  all ${entries.length} workflow(s) are up to date at ${targetRef}\n`))
      return
    }

    if (!flags.yes) {
      const proceed = await confirm({
        message: `Update ${outdated.length} workflow(s) to ${targetRef}?`,
        default: true,
      })

      if (!proceed) {
        this.log(ux.colorize("yellow", "\n  cancelled.\n"))
        return
      }

      this.log()
    }

    const targetDir = join(cwd, ".github", "workflows")
    let updated = 0
    let errors = 0
    const updatedEntries: { name: string; file: string }[] = []

    const sha = await resolveRefSha(targetRef)
    if (sha !== targetRef) {
      this.log(ux.colorize("dim", `  resolved ${targetRef} → ${sha.slice(0, 12)}`))
    }

    this.log(ux.colorize("dim", `  fetching from ${REPO} @ ${targetRef}\n`))

    for (const entry of outdated) {
      try {
        let content = await fetchWorkflowContent(entry.file, targetRef)
        content = injectRefComment(content, targetRef, sha)
        writeFileSync(join(targetDir, entry.file), content, "utf-8")
        this.log(`  ${ux.colorize("green", "update")}  ${entry.file} ${ux.colorize("dim", `(${entry.ref} → ${targetRef})`)}`)
        updatedEntries.push({ name: entry.name, file: entry.file })
        updated++
      } catch (error: any) {
        this.log(`  ${ux.colorize("red", "error")}   ${entry.file}: ${error.message}`)
        errors++
      }
    }

    if (updatedEntries.length > 0) {
      const updatedLock = mergeLockfile(lock, targetRef, updatedEntries)
      writeLockfile(updatedLock, cwd)
    }

    await this.refreshAgents(targetRef, cwd)

    this.log(`\n  done — ${ux.colorize("green", `${updated} updated`)}, ${errors} errors, ${upToDate.length} already current\n`)
  }

  private resolveCwd(flag?: string): string {
    const cwd = flag ? resolvePath(flag) : process.cwd()
    if (!existsSync(cwd)) {
      this.error(`--cwd path does not exist: ${cwd}`, { exit: 2 })
    }
    return cwd
  }

  private async refreshAgents(ref: string, cwd: string): Promise<void> {
    const targetPath = join(cwd, ".github", AGENTS_FILE)

    mkdirSync(join(cwd, ".github"), { recursive: true })

    const template = await fetchAgentsTemplate(ref)
    if (template) {
      writeFileSync(targetPath, template, "utf-8")
      this.log(`  ${ux.colorize("green", "update")}  ${AGENTS_REL_PATH} ${ux.colorize("dim", `→ ${ref}`)}`)
    } else {
      this.log(`  ${ux.colorize("yellow", "warn")}    could not fetch ${AGENTS_TEMPLATE_PATH} from ${ref} ${ux.colorize("dim", `(${AGENTS_REL_PATH} not updated)`)}`)
    }

    const link = ensureAgentsLink(cwd, { force: false })
    if (link === "created") {
      this.log(`  ${ux.colorize("green", "link")}    ${AGENTS_FILE} → ${AGENTS_REL_PATH}`)
    } else if (link === "unchanged") {
      this.log(`  ${ux.colorize("dim", "link")}    ${AGENTS_FILE} → ${AGENTS_REL_PATH} ${ux.colorize("dim", "(already linked)")}`)
    } else if (link === "skipped-exists") {
      this.log(`  ${ux.colorize("dim", "skip")}    ${AGENTS_FILE} ${ux.colorize("dim", "(real file at root — remove it to let the toolkit manage the symlink)")}`)
    }
  }
}

