// resolve-deploy-config.ts
// ---
// step: determine compose profiles, app profile, and timezone
// for a deploy-to-vps workflow based on the target environment.
//
// env:
//   DEPLOY_ENVIRONMENT — target hostname / ip (required)
//   DEPLOY_CONFIG      — json map of environment → config overrides (optional)
//                        when provided, overrides the built-in defaults.
//                        format: { "<host>": { "compose_profiles": "...", "profiles": "...", "app_tz": "..." } }
//
// exports to $GITHUB_ENV:
//   COMPOSE_PROFILES — comma-separated list of compose service profiles
//   PROFILES         — app-level profile name
//   APP_TZ           — timezone string
// ---

import { getEnv, getRequiredEnv, log, setEnv } from "./_lib/github"

// --- built-in environment config ---

interface DeployConfig {
  compose_profiles: string
  profiles: string
  app_tz: string
}

const DEFAULTS: Record<string, DeployConfig> = {
  "test.camasys.com": {
    compose_profiles: "@camasys/frontend_core,@camasys/backend_core,@camasys/backend_gps,camasys-external-signature-app",
    profiles: "test",
    app_tz: "Europe/Bratislava",
  },
  "app.camasys.com": {
    compose_profiles: "@camasys/frontend_core,@camasys/backend_core,camasys-external-signature-app",
    profiles: "avis-sk",
    app_tz: "Europe/Bratislava",
  },
  "camasys.autoin.cz": {
    compose_profiles: "@camasys/frontend_core,@camasys/backend_core,camasys-external-signature-app",
    profiles: "auto-in",
    app_tz: "Europe/Bratislava",
  },
  "camasys.avis.fo": {
    compose_profiles: "@camasys/frontend_core,@camasys/backend_core,camasys-external-signature-app",
    profiles: "avis-fo",
    app_tz: "Europe/Bratislava",
  },
  "camasys.net": {
    compose_profiles: "@camasys/frontend_core,@camasys/backend_core",
    profiles: "single-instance-test",
    app_tz: "UTC",
  },
  "78.47.109.42": {
    compose_profiles: "@camasys/backend_gps",
    profiles: "",
    app_tz: "UTC",
  },
}

// --- resolve ---

const environment = getRequiredEnv("DEPLOY_ENVIRONMENT")
const customConfigRaw = getEnv("DEPLOY_CONFIG", "")

log.info(`resolving deploy config for: ${environment}`)

let config: DeployConfig | undefined

// try custom config first
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

// fall back to built-in defaults
if (!config) {
  config = DEFAULTS[environment]
}

if (!config) {
  log.error(`unknown environment: "${environment}"`)
  log.error(`known environments: ${Object.keys(DEFAULTS).join(", ")}`)
  process.exit(1)
}

// --- export to $GITHUB_ENV ---

setEnv("COMPOSE_PROFILES", config.compose_profiles)
setEnv("PROFILES", config.profiles)
setEnv("APP_TZ", config.app_tz)

log.info(`COMPOSE_PROFILES=${config.compose_profiles}`)
log.info(`PROFILES=${config.profiles}`)
log.info(`APP_TZ=${config.app_tz}`)

