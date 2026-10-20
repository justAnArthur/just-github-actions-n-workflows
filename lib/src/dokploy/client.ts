export interface DokployCompose {
  composeId: string
  name: string
  appName: string
  env?: string | null
  composeFile?: string | null
  sourceType?: string
  serverId?: string | null
}

// environment.one lists composes without appName/env; read compose.one for those
export type DokployComposeSummary = Pick<DokployCompose, "composeId" | "name">

export interface DokployEnvironment {
  environmentId: string
  name: string
  compose: DokployComposeSummary[]
}

export type DeploymentStatus = "running" | "done" | "error" | (string & {})

export interface DokployDeployment {
  deploymentId: string
  status: DeploymentStatus
  createdAt: string
  title?: string | null
}

export interface CreateComposeInput {
  name: string
  appName: string
  environmentId: string
  description?: string
  serverId?: string
}

export type UpdateComposeInput = { composeId: string } & Partial<{
  env: string
  composeFile: string
  sourceType: "raw" | (string & {})
  autoDeploy: boolean
  description: string
}>

export type DokployClient = ReturnType<typeof createDokployClient>

const BODY_LIMIT = 500

export function createDokployClient(baseUrl: string, apiKey: string, fetchImpl: typeof fetch = fetch) {
  const root = baseUrl.replace(/\/+$/, "")

  async function call<T>(method: "GET" | "POST", procedure: string, params: Record<string, unknown>): Promise<T> {
    const path = `/api/${procedure}`
    let url = root + path
    const init: RequestInit = { method, headers: { "x-api-key": apiKey, "content-type": "application/json" } }

    if (method === "GET") {
      url += `?${new URLSearchParams(params as Record<string, string>)}`
    } else {
      init.body = JSON.stringify(params)
    }

    const response = await fetchImpl(url, init)
    const text = await response.text()
    if (!response.ok) {
      const body = text.length > BODY_LIMIT ? `${text.slice(0, BODY_LIMIT)}…` : text
      throw new Error(`dokploy ${method} ${path} failed with HTTP ${response.status}: ${body}`)
    }
    return (text ? JSON.parse(text) : undefined) as T
  }

  return {
    getEnvironment: (environmentId: string) =>
      call<DokployEnvironment>("GET", "environment.one", { environmentId }),
    getCompose: (composeId: string) =>
      call<DokployCompose>("GET", "compose.one", { composeId }),
    createCompose: (input: CreateComposeInput) =>
      call<DokployCompose>("POST", "compose.create", { ...input, composeType: "docker-compose" }),
    updateCompose: (input: UpdateComposeInput) =>
      call<unknown>("POST", "compose.update", input),
    deployCompose: (composeId: string, title?: string, description?: string) =>
      call<unknown>("POST", "compose.deploy", { composeId, title, description }),
    deleteCompose: (composeId: string, deleteVolumes: boolean) =>
      call<unknown>("POST", "compose.delete", { composeId, deleteVolumes }),
    listDeployments: (composeId: string) =>
      call<DokployDeployment[]>("GET", "deployment.allByCompose", { composeId })
  }
}

export async function findComposeByName(
  client: Pick<DokployClient, "getEnvironment">,
  environmentId: string,
  name: string
): Promise<DokployComposeSummary | undefined> {
  const environment = await client.getEnvironment(environmentId)
  return environment.compose.find((compose) => compose.name === name)
}

export function latestDeployment(deployments: DokployDeployment[]): DokployDeployment | undefined {
  return deployments.reduce<DokployDeployment | undefined>(
    (latest, d) => (!latest || Date.parse(d.createdAt) > Date.parse(latest.createdAt) ? d : latest),
    undefined
  )
}

export interface WaitOptions {
  timeoutMs: number
  intervalMs?: number
}

// the failed deployment rides along as `cause` so callers can still report its id and status
export async function waitForDeployment(
  client: Pick<DokployClient, "listDeployments">,
  composeId: string,
  previousId: string | undefined,
  { timeoutMs, intervalMs = 5_000 }: WaitOptions
): Promise<DokployDeployment> {
  const deadline = Date.now() + timeoutMs

  while (true) {
    const latest = latestDeployment(await client.listDeployments(composeId))
    const fresh = latest && latest.deploymentId !== previousId ? latest : undefined
    if (fresh?.status === "done") return fresh
    if (fresh?.status === "error" || fresh?.status === "cancelled") {
      throw new Error(`dokploy deployment ${fresh.deploymentId} of compose ${composeId} ended with status "${fresh.status}"`, { cause: fresh })
    }

    if (Date.now() + intervalMs > deadline) {
      const state = fresh ? `deployment ${fresh.deploymentId} still "${fresh.status}"` : "no new deployment started"
      throw new Error(`timed out after ${Math.round(timeoutMs / 1000)}s waiting for compose ${composeId}: ${state}`, { cause: fresh })
    }
    await Bun.sleep(intervalMs)
  }
}

export async function triggerDeployment(
  client: Pick<DokployClient, "listDeployments" | "deployCompose">,
  composeId: string,
  title?: string
): Promise<string> {
  const previousId = latestDeployment(await client.listDeployments(composeId))?.deploymentId ?? ""
  await client.deployCompose(composeId, title || undefined)
  return previousId
}
