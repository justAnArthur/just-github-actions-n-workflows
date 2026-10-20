import { getEnv, getRequiredEnv, log, setOutput } from "../github"
import { createDokployClient, type DokployClient, type DokployDeployment, triggerDeployment, waitForDeployment } from "./client"

export function clientFromEnv(): DokployClient {
  return createDokployClient(getRequiredEnv("DOKPLOY_URL"), getRequiredEnv("DOKPLOY_API_KEY"))
}

export function boolFromEnv(name: string, fallback: boolean): boolean {
  const value = getEnv(name).trim().toLowerCase()
  return value ? value === "true" : fallback
}

export function timeoutMsFromEnv(name: string, fallbackMinutes: number): number {
  const raw = getEnv(name).trim()
  const minutes = raw ? Number(raw) : fallbackMinutes
  if (!Number.isFinite(minutes) || minutes <= 0) throw new Error(`${name} must be a positive number of minutes, got "${raw}"`)
  return minutes * 60_000
}

// sets deployment_id + status and fails the step when the deployment fails or times out
export async function waitAndReport(client: DokployClient, composeId: string, previousId: string, timeoutMs: number): Promise<void> {
  log.info(`waiting up to ${timeoutMs / 60_000} min for a deployment newer than ${previousId || "(none)"}`)
  try {
    const deployment = await waitForDeployment(client, composeId, previousId, { timeoutMs })
    setOutput("deployment_id", deployment.deploymentId)
    setOutput("status", deployment.status)
    log.info(`deployment ${deployment.deploymentId} done`)
  } catch (error) {
    const failed = (error as Error).cause as DokployDeployment | undefined
    const finished = failed?.status === "error" || failed?.status === "cancelled"
    setOutput("deployment_id", failed?.deploymentId ?? "")
    setOutput("status", finished ? failed!.status : "timeout")
    log.error((error as Error).message)
    process.exit(1)
  }
}

export async function deployAndReport(
  client: DokployClient,
  composeId: string,
  { title, wait, timeoutMs }: { title?: string; wait: boolean; timeoutMs: number }
): Promise<void> {
  const previousId = await triggerDeployment(client, composeId, title)
  setOutput("previous_deployment_id", previousId)
  log.info(`deployment of compose ${composeId} queued`)

  if (wait) {
    await waitAndReport(client, composeId, previousId, timeoutMs)
  } else {
    setOutput("deployment_id", "")
    setOutput("status", "queued")
  }
}
