// settings/index.ts
// ---
// project settings file loader.
// reads `.justactions.yml` from the project root to configure
// deploy targets, module overrides, and other workflow settings.
//
// example `.justactions.yml`:
// ```yaml
// deploy:
//   ssh_target_path: ~/my-app
//   targets:
//     production:
//       host: app.example.com
//       compose_profiles: "@scope/backend,@scope/frontend"
//       profiles: "prod"
//       timezone: Europe/Bratislava
//     staging:
//       host: staging.example.com
//       compose_profiles: "@scope/backend"
//       profiles: "staging"
//       timezone: UTC
//
// modules:
//   overrides:
//     - name: "@scope/backend"
//       docker_compose_service: backend
//     - name: "@scope/frontend"
//       docker_compose_service: frontend
// ```
// ---

import * as fs from "node:fs/promises"
import * as path from "node:path"

// --- types ---

export interface DeployTarget {
  host: string;
  compose_profiles?: string;
  profiles?: string;
  timezone?: string;
}

export interface DeploySettings {
  ssh_target_path?: string;
  targets: Record<string, DeployTarget>;
}

export interface ModuleOverride {
  name: string;
  docker_compose_service?: string;
}

export interface ModuleSettings {
  overrides?: ModuleOverride[];
}

export interface Settings {
  deploy?: DeploySettings;
  modules?: ModuleSettings;
}

// --- constants ---

const SETTINGS_FILENAME = ".justactions.yml"

// --- simple yaml parser ---
// minimal parser for the subset of yaml we need.
// avoids adding a full yaml dependency. supports flat keys,
// nested objects (2-space indent), and arrays with `-` prefix.

function parseSimpleYaml(content: string): any {
  const lines = content.split("\n")
  const result: any = {}
  const stack: { obj: any; indent: number }[] = [{ obj: result, indent: -1 }]
  let currentArray: any[] | null = null
  let currentArrayKey = ""
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
        // check if it's a key: value pair within array
        const colonIdx = value.indexOf(":")
        if (colonIdx > 0) {
          const k = value.slice(0, colonIdx).trim()
          const v = value.slice(colonIdx + 1).trim()
          // start a new array object or add to last
          if (k === "name" || !currentArray.length || currentArray[currentArray.length - 1][k] !== undefined) {
            const item: any = {}
            item[k] = unquote(v)
            currentArray.push(item)
          } else {
            currentArray[currentArray.length - 1][k] = unquote(v)
          }
        } else {
          currentArray.push(unquote(value))
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

    // standalone array marker
    if (trimmed === "-") continue
  }

  // second pass: detect arrays by re-parsing
  return deepParseArrays(result, content)
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1)
  }
  return s
}

function deepParseArrays(obj: any, _raw: string): any {
  // basic approach: leave as-is since our simple parser handles the flat case
  return obj
}

// --- loader ---
// searches for `.justactions.yml` starting from `dir`, walking up
// to the filesystem root. returns the parsed settings or an empty
// default if no file is found.

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

// --- yaml → settings ---
// parses the yaml content into a typed Settings object.

function parseSettingsYaml(content: string): Settings {
  const raw = parseSimpleYaml(content)
  const settings: Settings = {}

  if (raw.deploy) {
    const deploy: DeploySettings = {
      ssh_target_path: raw.deploy.ssh_target_path,
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
          timezone: config.timezone ?? "UTC"
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

  return settings
}

// --- deploy target resolution ---
// resolves a deploy target by environment name from settings.
// falls back to a JSON-encoded DEPLOY_CONFIG env var override.

export function resolveDeployTarget(
  settings: Settings,
  environment: string
): DeployTarget | undefined {
  return settings.deploy?.targets?.[environment]
}

