// resolve-tag-meta/src/index.ts
// ---
// parses a git tag into structured metadata for publishing workflows.
// extracts package name, version, npm dist-tag, prerelease status,
// and deployment targets from the tag annotation.
// ---

import { getRequiredEnv, log, setOutput } from "@justanarthur/just-github-actions-n-workflows-lib/github"
import { cleanTagRef, isPrerelease, prereleaseChannel, moduleFromTag, versionFromTag } from "@justanarthur/just-github-actions-n-workflows-lib/git/tag-utils"
import { readTagAnnotation } from "@justanarthur/just-github-actions-n-workflows-lib/git/tag-n-push"

log.group("resolve-tag-meta")

const rawTag = getRequiredEnv("TAG")
const tag = cleanTagRef(rawTag)
log.info(`tag: ${tag}`)

const pkgName = moduleFromTag(tag)
const version = versionFromTag(tag)
const prerelease = isPrerelease(version)
const channel = prereleaseChannel(version)
const npmTag = channel ?? "latest"

log.info(`package: ${pkgName}`)
log.info(`version: ${version}`)
log.info(`prerelease: ${prerelease}`)
log.info(`channel: ${channel ?? "none"}`)
log.info(`npm tag: ${npmTag}`)

setOutput("tag", tag)
setOutput("pkg_name", pkgName)
setOutput("version", version)
setOutput("npm_tag", npmTag)
setOutput("is_prerelease", String(prerelease))
setOutput("prerelease_channel", channel ?? "")

// --- read deploy targets from tag annotation ---

const annotation = await readTagAnnotation(tag)
const deployTargets = annotation?.deployTargets ?? []

log.info(`deploy targets: ${deployTargets.length > 0 ? deployTargets.join(", ") : "(none — legacy tag or no annotation)"}`)

setOutput("deploy_targets", JSON.stringify(deployTargets))
setOutput("publish_npm", String(deployTargets.includes("npm")))
setOutput("publish_docker", String(deployTargets.includes("docker")))
setOutput("publish_vercel", String(deployTargets.includes("vercel")))
setOutput("has_annotation", String(annotation !== null))

log.groupEnd()
