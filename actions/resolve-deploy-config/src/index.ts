import { exec } from "@justanarthur/just-github-actions-n-workflows-lib/exec"
import { getEnv, log, setEnv, setOutput } from "@justanarthur/just-github-actions-n-workflows-lib/github"
import { manifestNameToImageName } from "@justanarthur/just-github-actions-n-workflows-lib/ghcr/delete-canary-images"
import { discoverModules } from "@justanarthur/just-github-actions-n-workflows-lib/modules"
import {
  fetchMergeablePullRequest,
  loadSettings,
  releaseModuleVersions,
  resolveDeployTarget,
  resolvePreview,
  targetsForChannel,
  validateDeployTarget,
  validatePreviews,
  type DeployTarget,
  type Settings
} from "@justanarthur/just-github-actions-n-workflows-lib/settings"

const environment = getEnv("DEPLOY_ENVIRONMENT")
const channel = getEnv("DEPLOY_CHANNEL")
const previewPr = getEnv("DEPLOY_PREVIEW_PR")

function fail(errors: string[]): never {
  for (const e of errors) log.error(e)
  process.exit(1)
}

const settings = await loadSettings(process.cwd())

if (environment) await resolveEnvironment(settings)
else if (channel) await resolveChannel(settings)
else if (previewPr) await resolvePreviewConfig(settings)
else fail(["set one of the inputs environment, channel or preview_pr"])

async function resolveEnvironment(settings: Settings) {
  const customConfigRaw = getEnv("DEPLOY_CONFIG", "")

  log.group("resolve-deploy-config")
  log.info(`target environment: ${environment}`)

  let config: Partial<DeployTarget> | undefined

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
    config = resolveDeployTarget(settings, environment)
    if (config) {
      log.info("using deploy target from .justactions.yml")
      const errors = validateDeployTarget(settings, environment)
      if (errors.length > 0) fail(errors)
    }
  }

  if (!config) {
    fail([
      `unknown environment: "${environment}"`,
      "no deploy target found in .justactions.yml or DEPLOY_CONFIG env var",
      `create a .justactions.yml with deploy.targets.${environment} or pass DEPLOY_CONFIG`
    ])
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

  const driver = config.driver ?? "ssh"
  log.info(`DEPLOY_HOST=${config.host ?? environment}`)
  log.info(`COMPOSE_PROFILES=${config.compose_profiles ?? ""}`)
  log.info(`PROFILES=${config.profiles ?? ""}`)
  log.info(`APP_TZ=${config.timezone ?? "UTC"}`)
  log.info(`driver=${driver} channel=${config.channel ?? "manual"}`)

  setOutput("host", config.host ?? environment)
  setOutput("compose_profiles", config.compose_profiles ?? "")
  setOutput("profiles", config.profiles ?? "")
  setOutput("app_tz", config.timezone ?? "UTC")
  if (composeFile) setOutput("compose_file", composeFile)
  if (settings.deploy?.ssh_target_path) setOutput("ssh_target_path", settings.deploy.ssh_target_path)
  setOutput("driver", driver)
  setOutput("channel", config.channel ?? "manual")
  if (driver === "dokploy") {
    setOutput("dokploy_url", settings.deploy?.dokploy?.url ?? "")
    setOutput("dokploy_compose_id", config.dokploy?.compose_id ?? "")
  }

  log.groupEnd()
}

async function resolveChannel(settings: Settings) {
  log.group(`resolve-deploy-config (channel ${channel})`)
  if (channel !== "stable" && channel !== "canary") fail([`channel must be "stable" or "canary", got "${channel}"`])

  const names = targetsForChannel(settings, channel)
  const errors = names.flatMap((name) => validateDeployTarget(settings, name))
  if (errors.length > 0) fail(errors)
  log.info(`targets on ${channel}: ${names.join(", ") || "(none)"}`)

  const releaseTag = getEnv("DEPLOY_RELEASE_TAG")
  let moduleVersions: Record<string, string> = {}
  if (releaseTag && names.length > 0) {
    const modules = await discoverModules(process.cwd(), { exclude: new Set(["node_modules", "dist", ".git", ".github"]) })
    const tags = (await exec("git tag -l")).split("\n").map((t) => t.trim()).filter(Boolean)
    moduleVersions = releaseModuleVersions(modules, tags, releaseTag, channel)
    log.info(`module versions: ${JSON.stringify(moduleVersions)}`)
  }

  const repository = (process.env.GITHUB_REPOSITORY ?? "").toLowerCase()
  const images = Object.entries(moduleVersions).map(([name, version]) => {
    const tag = version.replace(/[^A-Za-z0-9_.-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase()
    return `ghcr.io/${repository}/${manifestNameToImageName(name)}:${tag}`
  })

  const versionsJson = Object.keys(moduleVersions).length > 0 ? JSON.stringify(moduleVersions) : ""
  setOutput("targets", JSON.stringify(names.map((name) => ({ environment: name, module_versions: versionsJson }))))
  setOutput("has_targets", String(names.length > 0))
  setOutput("release_images", images.join("\n"))
  log.groupEnd()
}

async function resolvePreviewConfig(settings: Settings) {
  log.group(`resolve-deploy-config (preview #${previewPr})`)

  const errors = validatePreviews(settings)
  if (errors.length > 0) fail(errors)

  const repository = getEnv("GITHUB_REPOSITORY")
  let sha = getEnv("DEPLOY_PREVIEW_SHA")
  let headRef = ""

  // cleanup passes require_open=false: the pull request is closed by then
  if (!sha && getEnv("DEPLOY_PREVIEW_REQUIRE_OPEN", "true") === "true") {
    try {
      const pr = await fetchMergeablePullRequest({
        apiUrl: getEnv("GITHUB_API_URL", "https://api.github.com"),
        repository,
        pr: previewPr,
        token: getEnv("DEPLOY_GITHUB_TOKEN")
      })
      sha = pr.merge_commit_sha!
      headRef = pr.head.ref
    } catch (err) {
      fail([(err as Error).message])
    }
  }

  const preview = resolvePreview(settings, { pr: previewPr, sha, repository })
  log.info(`preview ${preview.name} -> ${preview.url} (image tag ${sha ? preview.image_tag : "n/a"})`)

  setOutput("dokploy_url", settings.deploy?.dokploy?.url ?? "")
  setOutput("preview_name", preview.name)
  setOutput("preview_merge_sha", sha)
  setOutput("preview_head_ref", headRef)
  setOutput("preview_image_tag", sha ? preview.image_tag : "")
  setOutput("preview_host", preview.host)
  setOutput("preview_url", preview.url)
  setOutput("preview_compose_file", preview.compose_file)
  setOutput("preview_environment_id", preview.environment_id)
  setOutput("preview_server_id", preview.server_id)
  setOutput("preview_env", preview.env)
  setOutput("preview_images", JSON.stringify(preview.images))
  setOutput("preview_image_repos", preview.images.map((i) => i.image).join("\n"))
  setOutput("preview_seed_ssh_host", preview.seed_ssh_host)
  setOutput("preview_seed_command", preview.seed_command)
  setOutput("preview_seed_upload", preview.seed_upload.map((u) => `${u.source}\t${u.target}`).join("\n"))
  setOutput("preview_cleanup_command", preview.cleanup_command)
  log.groupEnd()
}
