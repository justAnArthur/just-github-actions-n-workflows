import * as fs from "node:fs/promises"
import * as path from "node:path"
import type { DockerBuildSettings } from "./docker-build"

// --- types ---

export type DeployDriver = "ssh" | "dokploy"
export type DeployChannel = "manual" | "stable" | "canary"

export interface DokployTargetSettings {
  compose_id: string;
}

export interface DeployTarget {
  host: string;
  /** "ssh" (default) deploys with docker compose over ssh, "dokploy" redeploys a Dokploy compose */
  driver: DeployDriver;
  /** "manual" (default) is deployed only on dispatch; "stable" / "canary" also by deploy-on-release */
  channel: DeployChannel;
  compose_profiles?: string;
  profiles?: string;
  timezone?: string;
  /** path to docker-compose file (overrides deploy-level compose_file) */
  compose_file?: string;
  dokploy?: DokployTargetSettings;
}

export interface DokploySettings {
  /** base url of the Dokploy instance; the api key comes from the DOKPLOY_API_KEY secret */
  url: string;
}

export interface PreviewSeed {
  ssh_host: string;
  command?: string;
  /** repo path -> remote path */
  upload?: Record<string, string>;
}

export interface PreviewSettings {
  dokploy?: { environment_id: string; server_id?: string };
  /** preview hostname, `{pr}` is the pull request number */
  host?: string;
  compose_file?: string;
  env?: Record<string, string>;
  /** manifest names of the modules built for a preview */
  images?: string[];
  seed?: PreviewSeed;
  /** run over ssh on seed.ssh_host when the preview is removed */
  cleanup_command?: string;
}

export interface DeploySettings {
  ssh_target_path?: string;
  /** default path to docker-compose file for all targets */
  compose_file?: string;
  dokploy?: DokploySettings;
  targets: Record<string, DeployTarget>;
  previews?: PreviewSettings;
}

/** one deploy hook (e.g. one vercel project) that a tag can fan out to */
export interface DeployHookTarget {
  /** name of the repo secret that holds the deploy hook URL */
  hook_secret: string;
  /** release channels this target accepts: "stable" and/or prerelease channels ("beta", "rc", …). default: ["stable"] */
  channels: string[];
  /** package names this target deploys. empty = any package */
  packages: string[];
}

export interface VercelSettings {
  targets: Record<string, DeployHookTarget>;
}

export interface ModuleOverride {
  name: string;
  docker_compose_service?: string;
  docker?: DockerBuildSettings;
}

export interface ModuleSettings {
  overrides?: ModuleOverride[];
}

export interface GitSettings {
  committer_name?: string;
  committer_email?: string;
  co_author_email?: string;
}

export interface Settings {
  deploy?: DeploySettings;
  vercel?: VercelSettings;
  modules?: ModuleSettings;
  git?: GitSettings;
}

export const STABLE_CHANNEL = "stable"

const SETTINGS_FILENAME = ".justactions.yml"

function parseSimpleYaml(content: string): any {
  const lines = content.split("\n")
  const result: any = {}
  const stack: { obj: any; indent: number }[] = [{ obj: result, indent: -1 }]
  let currentArray: any[] | null = null
  let currentArrayParent: any = null

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "")
    if (line.trim() === "" || line.trim().startsWith("#")) continue

    const indent = line.length - line.trimStart().length
    const trimmed = line.trim()

    // pop stack to find the right parent level
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop()
      currentArray = null
    }

    const parent = stack[stack.length - 1].obj

    // array item
    if (trimmed.startsWith("- ")) {
      const value = trimmed.slice(2).trim()

      if (currentArray && currentArrayParent === parent) {
        const arr = currentArray as any[]
        // check if it's a key: value pair within array
        const colonIdx = value.indexOf(":")
        if (colonIdx > 0) {
          const k = value.slice(0, colonIdx).trim()
          const v = value.slice(colonIdx + 1).trim()
          // start a new array object or add to last
          if (k === "name" || !arr.length || arr[arr.length - 1][k] !== undefined) {
            const item: any = {}
            item[k] = unquote(v)
            arr.push(item)
          } else {
            arr[arr.length - 1][k] = unquote(v)
          }
        } else {
          arr.push(unquote(value))
        }
        continue
      }
    }

    // key: value
    const colonIdx = trimmed.indexOf(":")
    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim()
      const value = trimmed.slice(colonIdx + 1).trim()

      if (value === "" || value === "|") {
        // nested object or empty
        parent[key] = {}
        stack.push({ obj: parent[key], indent })
        currentArray = null
      } else {
        parent[key] = unquote(value)
      }

      // check if next lines are array items for this key
      continue
    }
  }

  // second pass: detect arrays by re-parsing
  return result
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1)
  }
  return s
}

export async function loadSettings(dir: string): Promise<Settings> {
  let current = path.resolve(dir)

  while (true) {
    let content: string | undefined
    try {
      content = await fs.readFile(path.join(current, SETTINGS_FILENAME), "utf-8")
    } catch {
      // file not found, walk up
    }
    if (content !== undefined) return parseSettingsYaml(content)

    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  return {}
}

// real yaml first; the hand-written parser stays as a fallback because it
// accepted files real yaml rejects (e.g. an unquoted `@scope/pkg` value)
function parseYaml(content: string): any {
  try {
    return Bun.YAML.parse(content) ?? {}
  } catch {
    return parseSimpleYaml(content)
  }
}

function str(value: unknown): string | undefined {
  if (value === undefined || value === null || typeof value === "object") return undefined
  return String(value)
}

function strMap(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(value)) {
    const s = str(v)
    if (s !== undefined) out[k] = s
  }
  return out
}

// keeps null values, they mean "unset"
function nullableStrMap(value: unknown): Record<string, string | null> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const out: Record<string, string | null> = {}
  for (const [k, v] of Object.entries(value)) {
    const s = v === null ? null : str(v)
    if (s !== undefined) out[k] = s
  }
  return out
}

function strList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.map(str).filter((v): v is string => v !== undefined)
  const s = str(value)
  return s === undefined ? undefined : s.split(",").map((v) => v.trim()).filter(Boolean)
}

function parseDockerBuild(raw: any): DockerBuildSettings | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const docker: DockerBuildSettings = {
    build_args: strMap(raw.build_args),
    secrets: strMap(raw.secrets),
    network: str(raw.network)
  }
  if (raw.preview && typeof raw.preview === "object") {
    docker.preview = {
      build_args: nullableStrMap(raw.preview.build_args),
      network: str(raw.preview.network)
    }
    if (raw.preview.service === false || raw.preview.service === null) docker.preview.service = false
  }
  if (raw.service && typeof raw.service === "object") {
    docker.service = {
      image: str(raw.service.image) ?? "",
      port: str(raw.service.port),
      env: strMap(raw.service.env),
      options: str(raw.service.options)
    }
  }
  return docker
}

function parseModuleOverride(raw: any): ModuleOverride {
  const override: ModuleOverride = { ...raw }
  const docker = parseDockerBuild(raw?.docker)
  if (docker) override.docker = docker
  return override
}

function parseTarget(name: string, config: any): DeployTarget {
  const target: DeployTarget = {
    host: str(config?.host) ?? name,
    driver: (str(config?.driver) ?? "ssh") as DeployDriver,
    channel: (str(config?.channel) ?? "manual") as DeployChannel,
    compose_profiles: str(config?.compose_profiles),
    profiles: str(config?.profiles),
    timezone: str(config?.timezone) ?? "UTC",
    compose_file: str(config?.compose_file)
  }
  if (config?.dokploy && typeof config.dokploy === "object") {
    target.dokploy = { compose_id: str(config.dokploy.compose_id) ?? "" }
  }
  return target
}

function parsePreviews(raw: any): PreviewSettings | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const previews: PreviewSettings = {
    host: str(raw.host),
    compose_file: str(raw.compose_file),
    env: strMap(raw.env),
    images: strList(raw.images),
    cleanup_command: str(raw.cleanup_command)
  }
  if (raw.dokploy && typeof raw.dokploy === "object") {
    previews.dokploy = {
      environment_id: str(raw.dokploy.environment_id) ?? "",
      server_id: str(raw.dokploy.server_id)
    }
  }
  if (raw.seed && typeof raw.seed === "object") {
    previews.seed = {
      ssh_host: str(raw.seed.ssh_host) ?? "",
      command: str(raw.seed.command),
      upload: strMap(raw.seed.upload)
    }
  }
  return previews
}

export function parseSettingsYaml(content: string): Settings {
  const raw = parseYaml(content)
  const settings: Settings = {}

  if (raw.deploy) {
    const deploy: DeploySettings = {
      ssh_target_path: str(raw.deploy.ssh_target_path),
      compose_file: str(raw.deploy.compose_file),
      targets: {}
    }

    const dokployUrl = str(raw.deploy.dokploy?.url)
    if (dokployUrl) deploy.dokploy = { url: dokployUrl }

    // each key under deploy.targets is an environment name
    for (const [envName, envConfig] of Object.entries(raw.deploy.targets ?? {})) {
      deploy.targets[envName] = parseTarget(envName, envConfig)
    }

    const previews = parsePreviews(raw.deploy.previews)
    if (previews) deploy.previews = previews

    settings.deploy = deploy
  }

  if (raw.vercel) {
    const targets: Record<string, DeployHookTarget> = {}

    // each key under vercel.targets is a target name (e.g. one vercel project)
    for (const [name, targetConfig] of Object.entries(raw.vercel.targets ?? {})) {
      const config = (targetConfig ?? {}) as any
      if (!config.hook_secret) {
        throw new Error(`.justactions.yml: vercel.targets.${name}.hook_secret is required`)
      }
      const channels = strList(config.channels) ?? []
      targets[name] = {
        hook_secret: String(config.hook_secret),
        channels: channels.length > 0 ? channels : [STABLE_CHANNEL],
        packages: strList(config.packages) ?? []
      }
    }

    settings.vercel = { targets }
  }

  if (raw.modules) {
    settings.modules = {
      overrides: Array.isArray(raw.modules.overrides) ? raw.modules.overrides.map(parseModuleOverride) : []
    }
  }

  if (raw.git) {
    settings.git = {
      committer_name: str(raw.git.committer_name),
      committer_email: str(raw.git.committer_email),
      co_author_email: str(raw.git.co_author_email)
    }
  }

  return settings
}

export function resolveDeployTarget(
  settings: Settings,
  environment: string
): DeployTarget | undefined {
  return settings.deploy?.targets?.[environment]
}

// validation is separate from loading so a broken deploy block never
// breaks unrelated readers of the file (e.g. configure-git-user)
export function validateDeployTarget(settings: Settings, environment: string): string[] {
  const target = resolveDeployTarget(settings, environment)
  if (!target) return [`deploy.targets.${environment} is not defined`]

  const at = `deploy.targets.${environment}`
  const errors: string[] = []

  if (!["ssh", "dokploy"].includes(target.driver)) {
    errors.push(`${at}.driver must be "ssh" or "dokploy", got "${target.driver}"`)
  }
  if (!["manual", "stable", "canary"].includes(target.channel)) {
    errors.push(`${at}.channel must be "manual", "stable" or "canary", got "${target.channel}"`)
  }
  if (target.driver === "dokploy") {
    if (!settings.deploy?.dokploy?.url) errors.push(`${at} uses driver dokploy but deploy.dokploy.url is not set`)
    if (!target.dokploy?.compose_id) errors.push(`${at}.dokploy.compose_id is required for driver dokploy`)
  }
  if (target.driver === "ssh" && !target.host) errors.push(`${at}.host is required for driver ssh`)

  return errors
}

export function validatePreviews(settings: Settings): string[] {
  const previews = settings.deploy?.previews
  if (!previews) return ["deploy.previews is not defined"]

  const errors: string[] = []
  if (!settings.deploy?.dokploy?.url) errors.push("deploy.dokploy.url is required for previews")
  if (!previews.dokploy?.environment_id) errors.push("deploy.previews.dokploy.environment_id is required")
  if (!previews.host) errors.push("deploy.previews.host is required")
  if (!previews.compose_file) errors.push("deploy.previews.compose_file is required")
  if (previews.seed && !previews.seed.ssh_host) errors.push("deploy.previews.seed.ssh_host is required when seed is set")
  if (previews.cleanup_command && !previews.seed?.ssh_host) {
    errors.push("deploy.previews.cleanup_command runs on deploy.previews.seed.ssh_host, which is not set")
  }
  return errors
}

export function targetsForChannel(settings: Settings, channel: DeployChannel): string[] {
  if (channel === "manual") return []
  return Object.entries(settings.deploy?.targets ?? {})
    .filter(([, target]) => target.channel === channel)
    .map(([name]) => name)
}

export { dockerBuildFor, fillRefs, hasDockerBuild, renderDockerBuild, validateDockerBuild, type DockerBuildPreview, type DockerBuildService, type DockerBuildSettings, type ResolvedDockerBuild } from "./docker-build"
export { fetchMergeablePullRequest, resolvePreview, type PreviewPullRequest, type ResolvedPreview } from "./preview"
export { releaseModuleVersions } from "./release"
