import path from "node:path"
import { getRequiredEnv, log, setOutput } from "@justanarthur/just-github-actions-n-workflows-lib/github"
import { moduleFromTag } from "@justanarthur/just-github-actions-n-workflows-lib/git/tag-utils"
import { discoverModules, findModuleByScope } from "@justanarthur/just-github-actions-n-workflows-lib/modules"

log.group("get-dockerfile-path")

const tagName = getRequiredEnv("TAG_NAME")
log.info(`tag: ${tagName}`)

const excludes = new Set(["node_modules", "dist", ".git", ".github"])
const modules = await discoverModules(process.cwd(), { exclude: excludes })
log.info(`discovered ${modules.length} module(s)`)

const moduleName = moduleFromTag(tagName)
log.info(`module: ${moduleName}`)

const mod = findModuleByScope(modules, moduleName)

if (!mod) {
  log.error(`no module found matching "${moduleName}"`)
  log.error(`available: ${modules.map((m) => m.name).join(", ")}`)
  process.exit(1)
}

const rawPath = mod.dockerfilePath

const dockerfilePath = rawPath
  ? path.resolve(mod.dir, rawPath)
  : null

if (!dockerfilePath) {
  log.error(`no dockerfilePath found for module ${moduleName}`)
  process.exit(1)
}

log.info(`resolved dockerfile: ${dockerfilePath}`)
setOutput("dockerfile", dockerfilePath)

const contextDir = path.dirname(dockerfilePath)
log.info(`context directory: ${contextDir}`)
setOutput("context", contextDir)

log.groupEnd()
