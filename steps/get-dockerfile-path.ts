// get-dockerfile-path.ts
// ---
// step: resolve the dockerfile path for a given release tag.
// looks up the matching manifest by module name, reads its
// `DockerfilePath` property, and writes the resolved absolute
// path (and context directory) to `$GITHUB_OUTPUT`.
//
// env:
//   TAG_NAME — release tag in `<module>@<version>` format (required)
//
// outputs:
//   dockerfile — absolute path to the dockerfile
//   context    — directory containing the dockerfile
// ---

import path from "node:path"
import { getRequiredEnv, log, setOutput } from "./_lib/github"
import { moduleFromTag } from "./_lib/git/tag-utils"
import { findManifests } from "./_lib/manifests"

log.group("get-dockerfile-path")

const tagName = getRequiredEnv("TAG_NAME")
log.info(`tag: ${tagName}`)

// --- discover manifests ---

const excludes = new Set(["node_modules", "dist", ".git", ".github"])
const manifests = await findManifests(process.cwd(), { exclude: excludes })
log.info(`discovered ${manifests.length} manifest(s)`)

// --- find matching manifest ---

const moduleName = moduleFromTag(tagName)
log.info(`module: ${moduleName}`)

const manifest = manifests.find((m) => m.name === moduleName)

if (!manifest) {
  log.error(`no manifest found matching module "${moduleName}"`)
  log.error(`available: ${manifests.map((m) => m.name).join(", ")}`)
  process.exit(1)
}

const rawPath = manifest?.DockerfilePath

const dockerfilePath = rawPath
  ? path.resolve(path.dirname((manifest as any).path), rawPath)
  : null

if (!dockerfilePath) {
  log.error(`no DockerfilePath found for module ${moduleName}`)
  process.exit(1)
}

// --- write outputs ---

log.info(`resolved dockerfile: ${dockerfilePath}`)
setOutput("dockerfile", dockerfilePath)

const contextDir = path.dirname(dockerfilePath)
log.info(`context directory: ${contextDir}`)
setOutput("context", contextDir)

log.groupEnd()

