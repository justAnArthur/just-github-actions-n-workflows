import path from "node:path"
import { getRequiredEnv, log, setOutput } from "@justanarthur/actions-lib/github"
import { moduleFromTag, versionFromTag } from "@justanarthur/actions-lib/git/tag-utils"
import { findManifests, type Manifest } from "@justanarthur/step-bump-manifest-versions/manifests"

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

const manifests = await findManifests(process.cwd())
log.info(`discovered ${manifests.length} manifest(s)`)

const manifest = manifests.find((m: Manifest) => m.name === moduleName)

if (!manifest) {
  log.error(`no manifest found matching module "${moduleName}"`)
  log.error(`available: ${manifests.map((m: Manifest) => m.name).join(", ")}`)
  process.exit(1)
}

const manifestPath = (manifest as any).path as string
const dir = path.relative(process.cwd(), path.dirname(manifestPath)) || "."
log.info(`resolved directory: ${dir}`)

setOutput("dir", dir)
setOutput("name", moduleName)
setOutput("version", version)

log.groupEnd()


