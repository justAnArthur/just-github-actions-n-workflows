import { appendStepSummary, getEnv, log, maskValue, setOutput } from "@justanarthur/just-github-actions-n-workflows-lib/github"
import { type HookResult, parseSecrets, planDeployHooks, releaseChannel, renderHookSummary } from "@justanarthur/just-github-actions-n-workflows-lib/deploy-hooks"
import { loadSettings } from "@justanarthur/just-github-actions-n-workflows-lib/settings"

log.group("trigger-deploy-hook")

const hookUrl = getEnv("DEPLOY_HOOK_URL")
const tag = getEnv("DEPLOY_TAG") || "(unknown)"
const pkgName = getEnv("DEPLOY_PKG_NAME")
const channel = releaseChannel(getEnv("DEPLOY_PRERELEASE_CHANNEL"))

async function post(name: string, url: string): Promise<{ result: HookResult; httpStatus: number; body: string }> {
  try {
    const response = await fetch(url, { method: "POST" })
    const body = await response.text()
    log.info(`${name}: status ${response.status}`)
    log.info(`${name}: response ${body}`)
    const result: HookResult = { name, status: response.ok ? "fired" : "failed", detail: `HTTP ${response.status}` }
    return { result, httpStatus: response.status, body }
  } catch (err) {
    log.error(`${name}: request failed — ${err}`)
    return { result: { name, status: "failed", detail: `request failed: ${err}` }, httpStatus: 0, body: "" }
  }
}

const targets = (await loadSettings(process.cwd())).vercel?.targets ?? {}
const results: HookResult[] = []

if (Object.keys(targets).length === 0) {
  // single-hook mode: no vercel.targets in .justactions.yml
  if (!hookUrl) {
    log.error("no hook_url given and no vercel.targets configured in .justactions.yml")
    process.exit(1)
  }
  log.info(`triggering deploy hook for ${tag}`)
  const { result, httpStatus, body } = await post("hook_url", hookUrl)
  setOutput("status", String(httpStatus))
  setOutput("body", body)
  results.push(result)
} else {
  if (hookUrl) log.info("vercel.targets is configured — hook_url is ignored")
  log.info(`fanning out ${tag} (package ${pkgName || "(any)"}, channel ${channel})`)

  const secrets = parseSecrets(getEnv("DEPLOY_SECRETS"))

  for (const entry of planDeployHooks(targets, pkgName, channel)) {
    if (!entry.fire) {
      log.info(`${entry.name}: skipped — ${entry.reason}`)
      results.push({ name: entry.name, status: "skipped", detail: entry.reason })
      continue
    }

    const url = secrets[entry.target.hook_secret]
    if (!url) {
      log.error(`${entry.name}: secret ${entry.target.hook_secret} is not set (or not passed to this job)`)
      results.push({ name: entry.name, status: "failed", detail: `secret \`${entry.target.hook_secret}\` not set` })
      continue
    }

    maskValue(url)
    results.push((await post(entry.name, url)).result)
  }
}

setOutput("results", JSON.stringify(results))
appendStepSummary(renderHookSummary(tag, channel, results))
log.groupEnd()

const failed = results.filter((r) => r.status === "failed")
if (failed.length > 0) {
  log.error(`deploy hook(s) failed: ${failed.map((r) => r.name).join(", ")}`)
  process.exit(1)
}

const fired = results.filter((r) => r.status === "fired").length
log.info(fired > 0 ? `${fired} deploy hook(s) triggered` : "no deploy hook matched this tag")
