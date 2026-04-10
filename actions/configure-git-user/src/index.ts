import { $ } from "bun"
import { getEnv, getRequiredEnv, log } from "@justanarthur/just-github-actions-n-workflows-lib/github"

log.group("setup-git-author")

const mode = getEnv("MODE", "push")
const actor = getRequiredEnv("GITHUB_ACTOR")

log.info(`mode: ${mode}`)
log.info(`actor: ${actor}`)

let authorName: string
let authorEmail: string

if (mode === "push") {
  log.info("extracting author from last commit...")
  authorName = (await $`git log -1 --pretty=format:'%an'`.text()).trim().replace(/^'|'$/g, "")
  authorEmail = (await $`git log -1 --pretty=format:'%ae'`.text()).trim().replace(/^'|'$/g, "")

  if (!authorName) {
    log.warn("commit author name is empty, falling back to actor")
    authorName = actor
  }
  if (!authorEmail) {
    log.warn("commit author email is empty, falling back to actor noreply")
    authorEmail = `${actor}@users.noreply.github.com`
  }
} else {
  authorName = actor
  authorEmail = `${actor}@users.noreply.github.com`
}

log.info(`setting git user.name = ${authorName}`)
log.info(`setting git user.email = ${authorEmail}`)

await $`git config user.name ${authorName}`
await $`git config user.email ${authorEmail}`

log.info(`configured git user (${mode}): ${authorName} <${authorEmail}>`)
log.groupEnd()

