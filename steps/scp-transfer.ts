// scp-transfer.ts
// ---
// step: transfer files to a remote server using scp.
// supports multiple space-separated source paths.
//
// env:
//   SCP_HOST     — server ip or domain (required)
//   SCP_USERNAME — ssh username (required)
//   SCP_SOURCE   — local file/directory path(s), space-separated (required)
//   SCP_TARGET   — remote destination path (required)
// ---

import { $ } from "bun"
import { getRequiredEnv, log } from "./_lib/github"

const host = getRequiredEnv("SCP_HOST")
const username = getRequiredEnv("SCP_USERNAME")
const source = getRequiredEnv("SCP_SOURCE")
const target = getRequiredEnv("SCP_TARGET")

log.info(`transferring files to ${username}@${host}:${target}`)
log.info(`source: ${source}`)

// split in case multiple files are space-separated
const sourceFiles = source.split(/\s+/).filter(Boolean)

for (const file of sourceFiles) {
  log.info(`  copying ${file}...`)
  await $`scp -v -o StrictHostKeyChecking=no ${file} ${username}@${host}:${target}`
}

log.info("scp transfer complete")
