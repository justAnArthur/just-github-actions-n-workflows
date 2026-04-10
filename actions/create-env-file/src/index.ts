import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { getEnv, getRequiredEnv, log } from "@justanarthur/just-github-actions-n-workflows-lib/github"

log.group("create-dotenv")

const fileName = getEnv("ENV_FILE_NAME", ".env")
const variables = getRequiredEnv("ENV_FILE_VARIABLES")

let filePath = getEnv("ENV_FILE_PATH", "./")
if (filePath.endsWith("/")) filePath = filePath.slice(0, -1)

const envFile = join(filePath, fileName)

log.info(`target: ${envFile}`)

mkdirSync(filePath, { recursive: true })

const lines = variables
  .split("\n")
  .filter((line) => line.trim().length > 0 && !line.trim().startsWith("#"))

writeFileSync(envFile, lines.join("\n") + "\n", "utf-8")

log.info(`created ${envFile} with ${lines.length} variable(s):`)
for (const line of lines) {
  log.info(`  ${line}`)
}

log.groupEnd()

