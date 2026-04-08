// configure-git-user.ts
// ---
// step: configure `git user.name` and `git user.email` for the current run.
//
// in push mode the author is extracted from the triggering commit;
// in dispatch mode the github actor who triggered the run is used.
//
// env:
//   MODE          — "push" or "dispatch" (default: "push")
//   GITHUB_ACTOR  — the github user who triggered the workflow (required)
// ---

import { $ } from "bun"
import { getEnv, getRequiredEnv, log } from "./_lib/github"

log.group("configure-git-user")

const mode = getEnv("MODE", "push")
const actor = getRequiredEnv("GITHUB_ACTOR")

log.info(`mode: ${mode}`)
log.info(`actor: ${actor}`)

let authorName: string
let authorEmail: string

if (mode === "push") {
  // use the commit author from the triggering push
  log.info("extracting author from last commit...")
  authorName = (await $`git log -1 --pretty=format:'%an'`.text()).trim().replace(/^'|'$/g, "")
  authorEmail = (await $`git log -1 --pretty=format:'%ae'`.text()).trim().replace(/^'|'$/g, "")

  // fall back to actor when the commit metadata is empty
  if (!authorName) {
    log.warn("commit author name is empty, falling back to actor")
    authorName = actor
  }
  if (!authorEmail) {
    log.warn("commit author email is empty, falling back to actor noreply")
    authorEmail = `${actor}@users.noreply.github.com`
  }
} else {
  // workflow_dispatch — use the actor who triggered the run
  authorName = actor
  authorEmail = `${actor}@users.noreply.github.com`
}

log.info(`setting git user.name = ${authorName}`)
log.info(`setting git user.email = ${authorEmail}`)

await $`git config user.name ${authorName}`
await $`git config user.email ${authorEmail}`

log.info(`configured git user (${mode}): ${authorName} <${authorEmail}>`)
log.groupEnd()
