import { getEnv, getRequiredEnv, log, setEnv } from "@justanarthur/actions-lib/github"

interface DeployConfig {
  compose_profiles: string
  profiles: string
  app_tz: string
}

const DEFAULTS: Record<string, DeployConfig> = {
  "test.camasys.com": {
    compose_profiles: "@camasys/frontend_core,@camasys/backend_core,@camasys/backend_gps,camasys-external-signature-app",
    profiles: "test",
    app_tz: "Europe/Bratislava"
  },
  "app.camasys.com": {
    compose_profiles: "@camasys/frontend_core,@camasys/backend_core,camasys-external-signature-app",
    profiles: "avis-sk",
    app_tz: "Europe/Bratislava"
  },
  "camasys.autoin.cz": {
    compose_profiles: "@camasys/frontend_core,@camasys/backend_core,camasys-external-signature-app",
    profiles: "auto-in",
    app_tz: "Europe/Bratislava"
  },
  "camasys.avis.fo": {
    compose_profiles: "@camasys/frontend_core,@camasys/backend_core,camasys-external-signature-app",
    profiles: "avis-fo",
    app_tz: "Europe/Bratislava"
  },
  "camasys.net": {
    compose_profiles: "@camasys/frontend_core,@camasys/backend_core",
    profiles: "single-instance-test",
    app_tz: "UTC"
  },
  "78.47.109.42": {
    compose_profiles: "@camasys/backend_gps",
    profiles: "",
    app_tz: "UTC"
  }
}

const environment = getRequiredEnv("DEPLOY_ENVIRONMENT")
const customConfigRaw = getEnv("DEPLOY_CONFIG", "")

log.group("resolve-deploy-config")
log.info(`target environment: ${environment}`)

let config: DeployConfig | undefined

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

if (!config) {
  config = DEFAULTS[environment]
  if (config) log.info("using built-in default config")
}

if (!config) {
  log.error(`unknown environment: "${environment}"`)
  log.error(`known environments: ${Object.keys(DEFAULTS).join(", ")}`)
  process.exit(1)
}

setEnv("COMPOSE_PROFILES", config.compose_profiles)
setEnv("PROFILES", config.profiles)
setEnv("APP_TZ", config.app_tz)

log.info(`COMPOSE_PROFILES=${config.compose_profiles}`)
log.info(`PROFILES=${config.profiles}`)
log.info(`APP_TZ=${config.app_tz}`)

log.groupEnd()

