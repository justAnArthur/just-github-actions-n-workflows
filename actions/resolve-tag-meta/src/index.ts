// resolve-tag-meta/src/index.ts
// ---
// parses a git tag into structured metadata for publishing workflows.
// extracts package name, version, npm dist-tag, and prerelease status.
// ---

import { getRequiredEnv, log, setOutput } from "@justanarthur/just-github-actions-n-workflows-lib/github"
import { cleanTagRef, isPrerelease, moduleFromTag, versionFromTag } from "@justanarthur/just-github-actions-n-workflows-lib/git/tag-utils"

log.group("resolve-tag-meta")

const rawTag = getRequiredEnv("TAG")
const tag = cleanTagRef(rawTag)
log.info(`tag: ${tag}`)

const pkgName = moduleFromTag(tag)
const version = versionFromTag(tag)
const prerelease = isPrerelease(version)
const npmTag = prerelease ? "canary" : "latest"

log.info(`package: ${pkgName}`)
log.info(`version: ${version}`)
log.info(`prerelease: ${prerelease}`)
log.info(`npm tag: ${npmTag}`)

setOutput("tag", tag)
setOutput("pkg_name", pkgName)
setOutput("version", version)
setOutput("npm_tag", npmTag)
setOutput("is_prerelease", String(prerelease))

log.groupEnd()

