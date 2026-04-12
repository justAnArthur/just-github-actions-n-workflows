// prepare-docker-meta/src/index.ts
// ---
// prepares docker image metadata from a git tag for publishing workflows.
// extracts and sanitizes: image tag, package image name, repository info,
// prerelease status, and build context. replaces the inline bash script
// that was previously in the publish-docker-on-tag workflow.
// ---

import * as path from "node:path"
import * as fs from "node:fs"
import { getRequiredEnv, getEnv, log, setOutput } from "@justanarthur/just-github-actions-n-workflows-lib/github"
import { cleanTagRef, moduleFromTag, versionFromTag, isPrerelease } from "@justanarthur/just-github-actions-n-workflows-lib/git/tag-utils"
import { manifestNameToImageName } from "@justanarthur/just-github-actions-n-workflows-lib/ghcr/delete-canary-images"

log.group("prepare-docker-meta")

const rawTag = getRequiredEnv("TAG_NAME")
const dockerfilePath = getRequiredEnv("DOCKERFILE")
const contextInput = getEnv("CONTEXT", "")

// --- clean tag ---

const tag = cleanTagRef(rawTag)
log.info(`tag: ${tag}`)

if (!tag) {
  log.error("no tag available; aborting")
  process.exit(2)
}

// --- extract version and package ---

const version = versionFromTag(tag)
const packageRaw = moduleFromTag(tag) || "unknown-package"

log.info(`version: ${version}`)
log.info(`package: ${packageRaw}`)

// --- sanitize for docker ---

function sanitize(input: string): string {
  return input
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
}

const imageTag = sanitize(version) || `untagged-${Date.now()}`
const packageImageName = manifestNameToImageName(packageRaw) || "package-unknown"

log.info(`image tag: ${imageTag}`)
log.info(`package image name: ${packageImageName}`)

// --- repository info ---

const repository = (process.env.GITHUB_REPOSITORY ?? "").toLowerCase()
const repoName = repository.split("/")[1] ?? ""

log.info(`repository: ${repository}`)
log.info(`repo name: ${repoName}`)

// --- resolve build context ---
// check for a Dockerfile.context file next to the Dockerfile.
// if present, use the first line as the build context directory.

let context = contextInput || path.dirname(dockerfilePath)

const contextFilePath = path.join(path.dirname(dockerfilePath), "Dockerfile.context")
if (fs.existsSync(contextFilePath)) {
  const candidate = fs.readFileSync(contextFilePath, "utf-8")
    .split("\n")[0]
    .trim()
  if (candidate && fs.existsSync(candidate)) {
    context = candidate
    log.info(`using build context from Dockerfile.context: ${context}`)
  }
}

log.info(`context: ${context}`)

// --- prerelease detection ---

const prerelease = isPrerelease(version)
log.info(`prerelease: ${prerelease}`)

// --- outputs ---

setOutput("dockerfile", dockerfilePath)
setOutput("context", context)
setOutput("image_tag", imageTag)
setOutput("repository", repository)
setOutput("repo_name", repoName)
setOutput("package_raw", packageRaw)
setOutput("package_image_name", packageImageName)
setOutput("is_prerelease", String(prerelease))
setOutput("original_tag", tag)

log.groupEnd()

