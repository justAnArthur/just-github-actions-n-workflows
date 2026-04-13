// cli/src/commands/update.ts
// ---
// updates previously installed workflows to a newer version.
// reads .toolkit-lock.json to find installed workflows, then
// re-fetches them from the specified (or latest) git ref.
// ---

import { Command, Flags, ux } from "@oclif/core"
import { confirm } from "@inquirer/prompts"
import { writeFileSync } from "node:fs"
import { join } from "node:path"

import {
  REPO,
  fetchTags,
  fetchWorkflowContent,
  resolveRefSha,
} from "../github.js"
import {
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
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Update)

    // --- read lock file ---

    const lock = readLockfile()

    if (!lock || Object.keys(lock.workflows).length === 0) {
      this.error(
        "No .toolkit-lock.json found. Run `init` first to install workflows.",
        { exit: 1 }
      )
    }

    // --- resolve target ref ---

    const tags = await fetchTags()
    const targetRef = flags.ref ?? (tags.length > 0 ? tags[0].tag : null)

    if (!targetRef) {
      this.error("No published versions found.", { exit: 1 })
    }

    const entries = Object.values(lock.workflows)

    this.log()
    this.log(ux.colorize("bold", "  workflow update check"))
    this.log(ux.colorize("dim", `  target: ${targetRef}\n`))

    // --- compare versions ---

    const outdated: LockEntry[] = []
    const upToDate: LockEntry[] = []

    for (const entry of entries) {
      if (entry.ref === targetRef) {
        upToDate.push(entry)
      } else {
        outdated.push(entry)
      }
    }

    // --- print status table ---

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


    // --- confirm ---

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

    // --- update files ---

    const targetDir = join(process.cwd(), ".github", "workflows")
    let updated = 0
    let errors = 0
    const updatedEntries: { name: string; file: string }[] = []

    // resolve tag → commit SHA for safe `uses:` refs
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

    // --- update lock file ---

    if (updatedEntries.length > 0) {
      const updatedLock = mergeLockfile(lock, targetRef, updatedEntries)
      writeLockfile(updatedLock)
    }

    this.log(`\n  done — ${ux.colorize("green", `${updated} updated`)}, ${errors} errors, ${upToDate.length} already current\n`)
  }
}

