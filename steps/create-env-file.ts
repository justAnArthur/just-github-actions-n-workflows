// create-env-file.ts
// ---
// step: write a `.env` file from newline-separated key=value pairs.
// blank lines and comments (lines starting with `#`) are stripped.
//
// env:
//   ENV_FILE_NAME      — output file name (default: ".env")
//   ENV_FILE_PATH      — directory to write into (default: "./")
//   ENV_FILE_VARIABLES — newline-separated key=value pairs (required)
// ---

import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { getEnv, getRequiredEnv, log } from "./_lib/github"

log.group("create-env-file")

const fileName = getEnv("ENV_FILE_NAME", ".env")
const variables = getRequiredEnv("ENV_FILE_VARIABLES")

// normalise the path — strip trailing slash for consistent `join()`
let filePath = getEnv("ENV_FILE_PATH", "./")
if (filePath.endsWith("/")) filePath = filePath.slice(0, -1)

const envFile = join(filePath, fileName)

log.info(`target: ${envFile}`)

// ensure the target directory exists
mkdirSync(filePath, { recursive: true })

// filter out empty lines and comments, then write
const lines = variables
  .split("\n")
  .filter((line) => line.trim().length > 0 && !line.trim().startsWith("#"))

writeFileSync(envFile, lines.join("\n") + "\n", "utf-8")

log.info(`created ${envFile} with ${lines.length} variable(s):`)
for (const line of lines) {
  log.info(`  ${line}`)
}

log.groupEnd()

