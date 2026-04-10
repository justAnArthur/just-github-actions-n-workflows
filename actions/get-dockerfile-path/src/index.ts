import path from "node:path"
import { getRequiredEnv, log, setOutput } from "@justanarthur/actions-lib/github"
import { moduleFromTag } from "@justanarthur/actions-lib/git/tag-utils"
import { findManifests } from "@justanarthur/step-bump-manifest-versions/manifests"

log.group("get-dockerfile-path")

const tagName = getRequiredEnv("TAG_NAME")
log.info(`tag: ${tagName}`)

const excludes = new Set(["node_modules", "dist", ".git", ".github"])
const manifests = await findManifests(process.cwd(), { exclude: excludes })
log.info(`discovered ${manifests.length} manifest(s)`)

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

log.info(`resolved dockerfile: ${dockerfilePath}`)
setOutput("dockerfile", dockerfilePath)

const contextDir = path.dirname(dockerfilePath)
log.info(`context directory: ${contextDir}`)
setOutput("context", contextDir)

log.groupEnd()

