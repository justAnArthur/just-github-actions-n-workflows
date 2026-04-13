// trigger-deploy-hook/src/index.ts
// ---
// sends an HTTP POST to a deploy hook URL and validates the response.
// used for triggering external deployments (e.g. Vercel deploy hooks)
// without needing CLI tools or repository checkout.
// ---

import { getRequiredEnv, log, setOutput } from "@justanarthur/just-github-actions-n-workflows-lib/github"

log.group("trigger-deploy-hook")

const hookUrl = getRequiredEnv("DEPLOY_HOOK_URL")
const tag = process.env.DEPLOY_TAG || "(unknown)"

log.info(`triggering deploy hook for ${tag}`)

const response = await fetch(hookUrl, { method: "POST" })
const body = await response.text()

log.info(`status: ${response.status}`)
log.info(`response: ${body}`)

setOutput("status", String(response.status))
setOutput("body", body)

if (!response.ok) {
  log.error(`deploy hook failed with status ${response.status}`)
  process.exit(1)
}

log.info("deploy hook triggered successfully")
log.groupEnd()

