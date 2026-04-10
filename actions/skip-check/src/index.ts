import { $ } from "bun"
import { log, setOutput } from "@justanarthur/actions-lib/github"

log.group("check-ci-skip")

const message = (await $`git log -1 --pretty=%B`.text()).trim()
const committer = (await $`git log -1 --pretty=%ce`.text()).trim()

log.info(`last commit message: "${message}"`)
log.info(`committer: ${committer}`)

const skipByMessage = message.includes("[skip bump]")
const skipByBot =
  committer.includes("github-actions") || committer.includes("[bot]")

if (skipByMessage || skipByBot) {
  const reason = skipByMessage
    ? "commit message contains [skip bump]"
    : `committer is bot (${committer})`

  log.info(`skipping workflow: ${reason}`)
  setOutput("skip", "true")
  log.groupEnd()
  process.exit(78)
} else {
  log.info("no skip marker found — proceeding")
  setOutput("skip", "false")
  log.groupEnd()
}

