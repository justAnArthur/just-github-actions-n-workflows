import * as fs from "node:fs/promises"
import * as path from "node:path"

// --- types ---

export interface DeployTarget {
  host: string;
  compose_profiles?: string;
  profiles?: string;
  timezone?: string;
  /** path to docker-compose file (overrides deploy-level compose_file) */
  compose_file?: string;
}

export interface DeploySettings {
  ssh_target_path?: string;
  /** default path to docker-compose file for all targets */
  compose_file?: string;
  targets: Record<string, DeployTarget>;
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

export async function loadSettings(dir: string): Promise<Settings> {
  let current = path.resolve(dir)

  while (true) {
    const candidate = path.join(current, SETTINGS_FILENAME)
    let content: string | undefined
    try {
      content = await fs.readFile(candidate, "utf-8")
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

/** accepts a YAML list or a comma-separated string, like the other list-ish settings */
function toList(value: unknown): string[] {
  if (value == null) return []
  const items = Array.isArray(value) ? value : String(value).split(",")
  return items.map((v) => String(v).trim()).filter(Boolean)
}

export function parseSettingsYaml(content: string): Settings {
  const raw = (Bun.YAML.parse(content) ?? {}) as any
  const settings: Settings = {}

  if (raw.deploy) {
    const deploy: DeploySettings = {
      ssh_target_path: raw.deploy.ssh_target_path,
      compose_file: raw.deploy.compose_file,
      targets: {}
    }

    // each key under deploy.targets is an environment name
    for (const [envName, envConfig] of Object.entries(raw.deploy.targets ?? {})) {
      const config = (envConfig ?? {}) as any
      deploy.targets[envName] = {
        host: config.host ?? envName,
        compose_profiles: config.compose_profiles,
        profiles: config.profiles,
        timezone: config.timezone ?? "UTC",
        compose_file: config.compose_file
      }
    }

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
      const channels = toList(config.channels)
      targets[name] = {
        hook_secret: String(config.hook_secret),
        channels: channels.length > 0 ? channels : [STABLE_CHANNEL],
        packages: toList(config.packages)
      }
    }

    settings.vercel = { targets }
  }

  if (raw.modules) {
    settings.modules = {
      overrides: raw.modules.overrides ?? []
    }
  }

  if (raw.git) {
    settings.git = {
      committer_name: raw.git.committer_name,
      committer_email: raw.git.committer_email,
      co_author_email: raw.git.co_author_email,
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
