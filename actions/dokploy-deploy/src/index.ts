import { getEnv, getRequiredEnv, log } from "@justanarthur/just-github-actions-n-workflows-lib/github"
import { boolFromEnv, clientFromEnv, deployAndReport, timeoutMsFromEnv } from "@justanarthur/just-github-actions-n-workflows-lib/dokploy/action"
import { mergeEnv, parseEnvLines } from "@justanarthur/just-github-actions-n-workflows-lib/dokploy/env"

log.group("dokploy-deploy")

const client = clientFromEnv()
const composeId = getRequiredEnv("DOKPLOY_COMPOSE_ID")
const envUpdates = getEnv("DOKPLOY_ENV")
const wait = boolFromEnv("DOKPLOY_WAIT", true)
const timeoutMs = timeoutMsFromEnv("DOKPLOY_TIMEOUT_MINUTES", 15)

const compose = await client.getCompose(composeId)
log.info(`compose ${compose.name} (${compose.appName})`)

if (envUpdates.trim()) {
  const current = (compose.env ?? "").replace(/\r\n/g, "\n")
  const merged = mergeEnv(current, envUpdates)
  const keys = [...parseEnvLines(envUpdates).keys()].join(", ")
  if (merged === current) {
    log.info(`env already up to date (${keys})`)
  } else {
    await client.updateCompose({ composeId, env: merged })
    log.info(`env updated (${keys})`)
  }
}

await deployAndReport(client, composeId, { title: getEnv("DOKPLOY_TITLE"), wait, timeoutMs })

log.groupEnd()
