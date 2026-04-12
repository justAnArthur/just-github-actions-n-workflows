import path from "node:path"
import { getRequiredEnv, log, setOutput } from "@justanarthur/just-github-actions-n-workflows-lib/github"
import { moduleFromTag, versionFromTag } from "@justanarthur/just-github-actions-n-workflows-lib/git/tag-utils"
import { discoverModules, findModuleByScope } from "@justanarthur/just-github-actions-n-workflows-lib/modules"

log.group("resolve-package-dir")

const tagName = getRequiredEnv("TAG_NAME")
log.info(`tag: ${tagName}`)

const moduleName = moduleFromTag(tagName)
const version = versionFromTag(tagName)
log.info(`module: ${moduleName}`)
log.info(`version: ${version}`)

if (!moduleName) {
  log.error(`could not extract module name from tag "${tagName}"`)
  process.exit(1)
}

const modules = await discoverModules(process.cwd())
log.info(`discovered ${modules.length} module(s)`)

const mod = findModuleByScope(modules, moduleName)

if (!mod) {
  log.error(`no module found matching "${moduleName}"`)
  log.error(`available: ${modules.map((m) => m.name).join(", ")}`)
  process.exit(1)
}

const dir = path.relative(process.cwd(), mod.dir) || "."
log.info(`resolved directory: ${dir}`)

setOutput("dir", dir)
setOutput("name", moduleName)
setOutput("version", version)

log.groupEnd()
