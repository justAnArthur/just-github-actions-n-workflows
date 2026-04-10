import { $ } from "bun"
import { getRequiredEnv, log } from "@justanarthur/just-github-actions-n-workflows-lib/github"

log.group("scp-upload")

const host = getRequiredEnv("SCP_HOST")
const username = getRequiredEnv("SCP_USERNAME")
const source = getRequiredEnv("SCP_SOURCE")
const target = getRequiredEnv("SCP_TARGET")

log.info(`destination: ${username}@${host}:${target}`)
log.info(`source: ${source}`)

const sourceFiles = source.split(/\s+/).filter(Boolean)
log.info(`${sourceFiles.length} file(s) to transfer`)

for (const file of sourceFiles) {
  log.info(`  copying ${file}...`)
  await $`scp -v -o StrictHostKeyChecking=no ${file} ${username}@${host}:${target}`
  log.info(`  ${file} transferred`)
}

log.info("scp transfer complete")
log.groupEnd()

