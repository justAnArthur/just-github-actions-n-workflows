import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { getEnv, getRequiredEnv, log, maskValue } from "@justanarthur/just-github-actions-n-workflows-lib/github"
import { fillEnvLines } from "@justanarthur/just-github-actions-n-workflows-lib/settings"

log.group("create-dotenv")

const fileName = getEnv("ENV_FILE_NAME", ".env")
const variables = getRequiredEnv("ENV_FILE_VARIABLES")
const vars = JSON.parse(getEnv("ENV_FILE_VARS") || "{}")
const secrets = JSON.parse(getEnv("ENV_FILE_SECRETS") || "{}")

let filePath = getEnv("ENV_FILE_PATH", "./")
if (filePath.endsWith("/")) filePath = filePath.slice(0, -1)

const envFile = join(filePath, fileName)

log.info(`target: ${envFile}`)

mkdirSync(filePath, { recursive: true })

const { lines, secretKeys, usedSecrets, missing } = fillEnvLines(variables, { vars, secrets })
for (const value of usedSecrets) maskValue(value)
for (const ref of missing) log.warn(`${ref} is not set — written as an empty value`)

writeFileSync(envFile, lines.join("\n") + "\n", "utf-8")

log.info(`created ${envFile} with ${lines.length} variable(s):`)
for (const line of lines) {
  const key = line.slice(0, line.indexOf("="))
  log.info(secretKeys.has(key) ? `  ${key}=***` : `  ${line}`)
}

log.groupEnd()
