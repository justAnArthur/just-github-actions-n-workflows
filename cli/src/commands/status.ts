// cli/src/commands/status.ts
// ---
// shows the current state of installed workflows:
// version, install date, and whether each is outdated.
// ---

import { Command, Flags, ux } from "@oclif/core"

import { fetchTags } from "../github.js"
import { readLockfile } from "../lockfile.js"

export default class Status extends Command {
  static override description = "Show the status of installed workflows"

  static override examples = [
    "<%= config.bin %> status",
    "<%= config.bin %> status --ref v2.0.0",
  ]

  static override flags = {
    ref: Flags.string({
      description: "Compare against this ref instead of the latest tag",
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Status)

    const lock = readLockfile()

    if (!lock || Object.keys(lock.workflows).length === 0) {
      this.log(ux.colorize("yellow", "\n  no workflows installed — run `init` first.\n"))
      return
    }

    const tags = await fetchTags()
    const targetRef = flags.ref ?? (tags.length > 0 ? tags[0].tag : null)

    if (!targetRef) {
      this.log(ux.colorize("yellow", "\n  no published versions found.\n"))
      return
    }

    const entries = Object.values(lock.workflows)

    this.log()
    this.log(ux.colorize("bold", "  installed workflows"))
    this.log(ux.colorize("dim", `  latest: ${targetRef}\n`))

    let outdatedCount = 0

    for (const entry of entries) {
      const current = entry.ref === targetRef
      const icon = current ? ux.colorize("green", "✓") : ux.colorize("yellow", "⬆")
      const refLabel = current
        ? ux.colorize("green", entry.ref)
        : `${ux.colorize("yellow", entry.ref)} → ${ux.colorize("green", targetRef)}`
      const date = ux.colorize("dim", new Date(entry.installedAt).toLocaleDateString())

      this.log(`  ${icon} ${ux.colorize("cyan", entry.name.padEnd(28))} ${refLabel.padEnd(50)} ${date}`)

      if (!current) outdatedCount++
    }

    this.log()

    if (outdatedCount > 0) {
      this.log(ux.colorize("yellow", `  ${outdatedCount} workflow(s) can be updated — run \`update\` to upgrade.\n`))
    } else {
      this.log(ux.colorize("green", `  all ${entries.length} workflow(s) are up to date.\n`))
    }
  }
}

