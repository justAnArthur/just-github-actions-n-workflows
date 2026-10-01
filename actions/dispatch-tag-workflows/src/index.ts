import { getEnv, getRequiredEnv, log, setOutput } from "@justanarthur/just-github-actions-n-workflows-lib/github"
import {
  dispatchWorkflow,
  loadWorkflows,
  parseTagList,
  planDispatch,
  runsOnTagPush
} from "@justanarthur/just-github-actions-n-workflows-lib/workflow-dispatch"

log.group("dispatch-tag-workflows")

const tags = parseTagList(getEnv("TAGS"))
const dir = getEnv("WORKFLOWS_DIR") || ".github/workflows"
const dispatched: { tag: string; workflow: string }[] = []
let failures = 0

if (tags.length === 0) {
  log.info("no tags to dispatch")
} else {
  const token = getRequiredEnv("DISPATCH_TOKEN")
  const repository = getRequiredEnv("GITHUB_REPOSITORY")
  const apiUrl = getEnv("GITHUB_API_URL") || "https://api.github.com"
  const workflows = await loadWorkflows(dir)
  log.info(`scanned ${workflows.length} workflow file(s) in ${dir}`)

  for (const tag of tags) {
    const triggered = workflows.filter((w) => runsOnTagPush(w.on, tag))
    if (triggered.length === 0) {
      log.info(`${tag}: no installed workflow runs on this tag`)
      continue
    }

    for (const workflow of triggered) {
      const plan = planDispatch(workflow, tag)
      if (!plan) {
        log.warn(
          `${workflow.file} runs on push of ${tag} but can't be dispatched ` +
          `(needs a workflow_dispatch trigger whose only required input is "tag") — it will not run`
        )
        continue
      }

      try {
        await dispatchWorkflow({ apiUrl, repository, token, file: plan.file, ref: tag, inputs: plan.inputs })
        dispatched.push({ tag, workflow: plan.file })
        log.info(`${tag}: dispatched ${plan.file}`)
      } catch (err) {
        log.error(`${tag}: ${err instanceof Error ? err.message : err}`)
        failures++
      }
    }
  }
}

setOutput("dispatched", JSON.stringify(dispatched))
log.groupEnd()

if (failures > 0) {
  log.error(`${failures} tag workflow(s) could not be started — dispatch them manually with the tag as input`)
  process.exit(1)
}
