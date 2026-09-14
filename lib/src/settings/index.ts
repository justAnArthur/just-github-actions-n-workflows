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
  modules?: ModuleSettings;
  git?: GitSettings;
}

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
    const candidate = path.join(current, SETTINGS_FILENAME)
    try {
      const content = await fs.readFile(candidate, "utf-8")
      return parseSettingsYaml(content)
    } catch {
      // file not found, walk up
    }

    const parent = path.dirname(current)
    if (parent === current) break
    current = parent
  }

  return {}
}

function parseSettingsYaml(content: string): Settings {
  const raw = parseSimpleYaml(content)
  const settings: Settings = {}

  if (raw.deploy) {
    const deploy: DeploySettings = {
      ssh_target_path: raw.deploy.ssh_target_path,
      compose_file: raw.deploy.compose_file,
      targets: {}
    }

    // each key under deploy.targets is an environment name
    if (raw.deploy.targets) {
      for (const [envName, envConfig] of Object.entries(raw.deploy.targets)) {
        const config = envConfig as any
        deploy.targets[envName] = {
          host: config.host ?? envName,
          compose_profiles: config.compose_profiles,
          profiles: config.profiles,
          timezone: config.timezone ?? "UTC",
          compose_file: config.compose_file
        }
      }
    }

    settings.deploy = deploy
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
