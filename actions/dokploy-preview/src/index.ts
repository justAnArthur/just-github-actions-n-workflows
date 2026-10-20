import { getEnv, getRequiredEnv, log, setOutput } from "@justanarthur/just-github-actions-n-workflows-lib/github"
import { boolFromEnv, clientFromEnv, deployAndReport, timeoutMsFromEnv, waitAndReport } from "@justanarthur/just-github-actions-n-workflows-lib/dokploy/action"
import { findComposeByName } from "@justanarthur/just-github-actions-n-workflows-lib/dokploy/client"
import { mergeEnv } from "@justanarthur/just-github-actions-n-workflows-lib/dokploy/env"

const mode = getRequiredEnv("DOKPLOY_MODE").trim()
const environmentId = getRequiredEnv("DOKPLOY_ENVIRONMENT_ID")
const name = getRequiredEnv("DOKPLOY_NAME")
const client = clientFromEnv()

log.group(`dokploy-preview ${mode} ${name}`)

const existing = await findComposeByName(client, environmentId, name)
setOutput("found", String(Boolean(existing)))

switch (mode) {
  case "upsert": {
    const composePath = getRequiredEnv("DOKPLOY_COMPOSE_FILE")
    const composeFile = await Bun.file(composePath).text()

    const compose = existing ?? await client.createCompose({
      name,
      appName: name,
      environmentId,
      description: getEnv("DOKPLOY_DESCRIPTION") || undefined,
      serverId: getEnv("DOKPLOY_SERVER_ID") || undefined
    })
    setOutput("created", String(!existing))

    // environment.one lists composes without appName; compose.one has it
    const full = await client.getCompose(compose.composeId)
    log.info(`${existing ? "found" : "created"} compose ${full.composeId} (${full.appName})`)

    const currentEnv = full.env ?? ""
    await client.updateCompose({
      composeId: compose.composeId,
      sourceType: "raw",
      composeFile,
      env: mergeEnv(currentEnv.replace(/\r\n/g, "\n"), getEnv("DOKPLOY_ENV")),
      autoDeploy: false
    })
    log.info(`compose file set from ${composePath}`)

    setOutput("compose_id", full.composeId)
    setOutput("app_name", full.appName)

    if (boolFromEnv("DOKPLOY_DEPLOY", true)) {
      await deployAndReport(client, compose.composeId, {
        title: `preview ${name}`,
        wait: boolFromEnv("DOKPLOY_WAIT", true),
        timeoutMs: timeoutMsFromEnv("DOKPLOY_TIMEOUT_MINUTES", 30)
      })
    }
    break
  }

  case "delete": {
    setOutput("created", "false")
    if (!existing) {
      log.info(`no compose named ${name}, nothing to delete`)
      break
    }
    setOutput("compose_id", existing.composeId)
    setOutput("app_name", (await client.getCompose(existing.composeId)).appName)
    const deleteVolumes = boolFromEnv("DOKPLOY_DELETE_VOLUMES", true)
    await client.deleteCompose(existing.composeId, deleteVolumes)
    log.info(`deleted compose ${existing.composeId}${deleteVolumes ? " and its volumes" : ""}`)
    break
  }

  case "wait": {
    setOutput("created", "false")
    if (!existing) throw new Error(`no compose named ${name} in environment ${environmentId}`)
    setOutput("compose_id", existing.composeId)
    setOutput("app_name", (await client.getCompose(existing.composeId)).appName)
    await waitAndReport(
      client,
      existing.composeId,
      getEnv("DOKPLOY_PREVIOUS_DEPLOYMENT_ID"),
      timeoutMsFromEnv("DOKPLOY_TIMEOUT_MINUTES", 30)
    )
    break
  }

  default:
    throw new Error(`unknown mode "${mode}", expected upsert, delete or wait`)
}

log.groupEnd()
