import { getRequiredEnv, getEnv, log, setOutput } from "@justanarthur/just-github-actions-n-workflows-lib/github"
import { composeDeployScript } from "@justanarthur/just-github-actions-n-workflows-lib/compose-deploy"

log.group("deploy-compose-remote")

const targetPath = getRequiredEnv("TARGET_PATH")
const registries = [getEnv("REGISTRY", "ghcr.io"), ...getEnv("ADDITIONAL_REGISTRIES", "").split(/[\s,]+/)]
  .map((r) => r.trim())
  .filter(Boolean)
const username = getEnv("REGISTRY_USERNAME", "")
const password = getEnv("REGISTRY_PASSWORD", "")
const command = getEnv("DEPLOY_COMMAND", "").trim()

log.info(`target path: ${targetPath}`)
log.info(username && password ? `registries: ${registries.join(", ")}` : "no registry credentials, skipping login")
log.info(command ? `deploy command: ${command}` : "deploy: generated pull + up")

const script = composeDeployScript({ targetPath, registries, username, password, command })

log.info("generated deployment script")
log.debug(script)

setOutput("script", script)

log.groupEnd()
