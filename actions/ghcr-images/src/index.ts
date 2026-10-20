import { getEnv, getRequiredEnv, log, setOutput } from "@justanarthur/just-github-actions-n-workflows-lib/github"
import { deleteImagesWithTagPrefix, PackagesForbiddenError } from "@justanarthur/just-github-actions-n-workflows-lib/ghcr/delete-canary-images"
import { waitForImages } from "@justanarthur/just-github-actions-n-workflows-lib/ghcr/registry"

const mode = getRequiredEnv("GHCR_MODE")
const token = getRequiredEnv("GHCR_TOKEN")
const images = getEnv("GHCR_IMAGES").split("\n").map((l) => l.trim()).filter(Boolean)

log.group(`ghcr-images (${mode})`)

if (mode === "wait") {
  const minutes = Number(getEnv("GHCR_TIMEOUT_MINUTES", "30")) || 30
  const missing = await waitForImages(images, token, { timeoutMs: minutes * 60_000 })
  if (missing.length > 0) {
    log.error(`not on the registry after ${minutes} min: ${missing.join(", ")}`)
    log.error("check that publish-docker-on-tag ran and succeeded for these tags")
    process.exit(1)
  }
} else if (mode === "delete") {
  const prefix = getRequiredEnv("GHCR_TAG_PREFIX")
  let deleted = 0

  for (const image of images) {
    // ghcr.io/<owner>/<package path>
    const [, owner, ...rest] = image.replace(/:[^/]*$/, "").split("/")
    if (!owner || rest.length === 0) {
      log.error(`expected ghcr.io/<owner>/<image>, got "${image}"`)
      process.exit(1)
    }
    try {
      deleted += await deleteImagesWithTagPrefix(owner, rest.join("/"), prefix, token)
    } catch (err) {
      if (!(err instanceof PackagesForbiddenError)) throw err
      log.warn(`no permission to delete ${image}:${prefix}* — grant the workflow "packages: write" and give the repo admin access to the package (${(err as Error).message})`)
    }
  }
  setOutput("deleted", String(deleted))
} else {
  log.error(`unknown mode "${mode}" — expected wait or delete`)
  process.exit(1)
}

log.groupEnd()
