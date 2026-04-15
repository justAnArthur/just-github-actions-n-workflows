// resolves deployment configuration for a target environment.
// reads deploy targets from `.justactions.yml` settings file,
// with fallback to a JSON-encoded DEPLOY_CONFIG env var override.
// no hardcoded defaults — all config comes from the project.
// ---

import { getEnv, getRequiredEnv, log, setEnv, setOutput } from "@justanarthur/just-github-actions-n-workflows-lib/github"
import { loadSettings, resolveDeployTarget, type DeployTarget } from "@justanarthur/just-github-actions-n-workflows-lib/settings"

const environment = getRequiredEnv("DEPLOY_ENVIRONMENT")
const customConfigRaw = getEnv("DEPLOY_CONFIG", "")

log.group("resolve-deploy-config")
log.info(`target environment: ${environment}`)

const settings = await loadSettings(process.cwd())
let config: DeployTarget | undefined

// --- priority 1: JSON env var override ---

if (customConfigRaw) {
  try {
    const customConfig = JSON.parse(customConfigRaw)
    if (customConfig[environment]) {
      config = customConfig[environment]
      log.info("using custom DEPLOY_CONFIG override")
    }
  } catch (err) {
    log.warn(`failed to parse DEPLOY_CONFIG json: ${err}`)
  }
}

// --- priority 2: .justactions.yml settings file ---

if (!config) {
  config = resolveDeployTarget(settings, environment)
  if (config) {
    log.info("using deploy target from .justactions.yml")
  }
}

if (!config) {
  log.error(`unknown environment: "${environment}"`)
  log.error(`no deploy target found in .justactions.yml or DEPLOY_CONFIG env var`)
  log.error(`create a .justactions.yml with deploy.targets.${environment} or pass DEPLOY_CONFIG`)
  process.exit(1)
}

setEnv("DEPLOY_HOST", config.host ?? environment)
setEnv("COMPOSE_PROFILES", config.compose_profiles ?? "")
setEnv("PROFILES", config.profiles ?? "")
setEnv("APP_TZ", config.timezone ?? "UTC")

const composeFile = config.compose_file ?? settings.deploy?.compose_file ?? ""
if (composeFile) {
  setEnv("COMPOSE_FILE", composeFile)
  log.info(`COMPOSE_FILE=${composeFile}`)
}

if (settings.deploy?.ssh_target_path) {
  setEnv("SSH_TARGET_PATH", settings.deploy.ssh_target_path)
  log.info(`SSH_TARGET_PATH=${settings.deploy.ssh_target_path}`)
}

log.info(`DEPLOY_HOST=${config.host ?? environment}`)
log.info(`COMPOSE_PROFILES=${config.compose_profiles ?? ""}`)
log.info(`PROFILES=${config.profiles ?? ""}`)
log.info(`APP_TZ=${config.timezone ?? "UTC"}`)

setOutput("host", config.host ?? environment)
setOutput("compose_profiles", config.compose_profiles ?? "")
setOutput("profiles", config.profiles ?? "")
setOutput("app_tz", config.timezone ?? "UTC")
if (composeFile) setOutput("compose_file", composeFile)
if (settings.deploy?.ssh_target_path) setOutput("ssh_target_path", settings.deploy.ssh_target_path)

log.groupEnd()
