// configure-git-user/src/index.ts
// ---
// configures git committer identity and resolves the real user as a co-author.
// by default the bot is the committer and the real user (push author or actor)
// becomes a co-author. identities can be overridden via .justactions.yml
// settings (`git.committer_name`, `git.committer_email`, `git.co_author_email`)
// or via action inputs (env vars take highest priority).
// ---

import { $ } from "bun"
import { getEnv, getRequiredEnv, log, setOutput } from "@justanarthur/just-github-actions-n-workflows-lib/github"
import { GITHUB_ACTIONS_BOT } from "@justanarthur/just-github-actions-n-workflows-lib/git/co-authors"
import { loadSettings } from "@justanarthur/just-github-actions-n-workflows-lib/settings"

log.group("setup-git-author")

const mode = getEnv("MODE", "push")
const actor = getRequiredEnv("GITHUB_ACTOR")

log.info(`mode: ${mode}`)
log.info(`actor: ${actor}`)

// --- load project settings ---

const settings = await loadSettings(process.cwd())
const gitSettings = settings.git ?? {}

if (gitSettings.committer_name || gitSettings.committer_email || gitSettings.co_author_email) {
  log.info("loaded git identity overrides from .justactions.yml")
}

// --- resolve the real user identity (becomes co-author) ---

let userName: string
let userEmail: string

if (mode === "push") {
  log.info("extracting user from last commit...")
  userName = (await $`git log -1 --pretty=format:'%an'`.text()).trim().replace(/^'|'$/g, "")
  userEmail = (await $`git log -1 --pretty=format:'%ae'`.text()).trim().replace(/^'|'$/g, "")

  if (!userName) {
    log.warn("commit author name is empty, falling back to actor")
    userName = actor
  }
  if (!userEmail) {
    log.warn("commit author email is empty, falling back to actor noreply")
    userEmail = `${actor}@users.noreply.github.com`
  }
} else {
  userName = actor
  userEmail = `${actor}@users.noreply.github.com`
}

// --- resolve committer identity ---
// priority: env var override > .justactions.yml > bot default

const committerName = getEnv("COMMITTER_NAME_OVERRIDE") || gitSettings.committer_name || GITHUB_ACTIONS_BOT.name
const committerEmail = getEnv("COMMITTER_EMAIL_OVERRIDE") || gitSettings.committer_email || GITHUB_ACTIONS_BOT.email

// --- resolve co-author identity ---
// priority: env var override > .justactions.yml > resolved user email

const coAuthorName = userName
const coAuthorEmail = getEnv("CO_AUTHOR_EMAIL_OVERRIDE") || gitSettings.co_author_email || userEmail

// --- configure git ---

log.info(`committer: ${committerName} <${committerEmail}>`)
log.info(`co-author: ${coAuthorName} <${coAuthorEmail}>`)

await $`git config user.name ${committerName}`
await $`git config user.email ${committerEmail}`

// --- export for downstream steps ---

setOutput("committer_name", committerName)
setOutput("committer_email", committerEmail)
setOutput("co_author_name", coAuthorName)
setOutput("co_author_email", coAuthorEmail)

log.groupEnd()

