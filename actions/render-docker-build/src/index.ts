import { getEnv, getRequiredEnv, log, setOutput } from "@justanarthur/just-github-actions-n-workflows-lib/github"
import { renderDockerBuild } from "@justanarthur/just-github-actions-n-workflows-lib/settings"

log.group("render-docker-build")

const config = JSON.parse(getRequiredEnv("DOCKER_BUILD"))
const vars = JSON.parse(getEnv("BUILD_VARS") || "{}")
const secrets = JSON.parse(getEnv("BUILD_SECRETS") || "{}")

const rendered = renderDockerBuild(
  { build_args: config.build_args ?? {}, secrets: config.secrets ?? {} },
  { vars, secrets }
)

// names only, the values may be secrets
log.info(`build args: ${Object.keys(config.build_args ?? {}).join(", ") || "(none)"}`)
log.info(`secrets: ${Object.keys(config.secrets ?? {}).join(", ") || "(none)"}`)
for (const ref of rendered.missing) log.warn(`${ref} is not set — passed as an empty value`)

setOutput("build_args", rendered.build_args)
setOutput("secrets", rendered.secrets)

log.groupEnd()
