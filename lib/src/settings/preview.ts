import { imageTagEnvKey, manifestNameToImageName } from "../ghcr/delete-canary-images"
import { dockerBuildFor, hasDockerBuild, type ResolvedDockerBuild } from "./docker-build"
import type { Settings } from "./index"

export interface ResolvedPreview {
  name: string
  image_tag: string
  host: string
  url: string
  compose_file: string
  environment_id: string
  server_id: string
  env: string
  /** docker_build only for modules with `modules.overrides[].docker`, so other matrix entries stay as they were */
  images: { name: string; image: string; docker_build?: ResolvedDockerBuild }[]
  seed_ssh_host: string
  seed_command: string
  seed_upload: { source: string; target: string }[]
  cleanup_command: string
}

// {app_name} is left in place: it is only known after the compose exists
export function resolvePreview(
  settings: Settings,
  opts: { pr: number | string; sha: string; repository: string }
): ResolvedPreview {
  const previews = settings.deploy?.previews ?? {}
  const pr = String(opts.pr)
  const imageTag = `pr-${pr}-${opts.sha.slice(0, 8)}`
  const host = (previews.host ?? "").replaceAll("{pr}", pr)
  const fill = (s: string) => s
    .replaceAll("{pr}", pr)
    .replaceAll("{host}", host)
    .replaceAll("{image_tag}", imageTag)

  const imageNames = previews.images ?? []
  const repository = opts.repository.toLowerCase()

  const env = [
    ...imageNames.map((name) => `${imageTagEnvKey(name)}=${imageTag}`),
    ...Object.entries(previews.env ?? {}).map(([k, v]) => `${k}=${fill(v)}`)
  ]

  return {
    name: `pr-${pr}`,
    image_tag: imageTag,
    host,
    url: host ? `https://${host}` : "",
    compose_file: previews.compose_file ?? "",
    environment_id: previews.dokploy?.environment_id ?? "",
    server_id: previews.dokploy?.server_id ?? "",
    env: env.join("\n"),
    images: imageNames.map((name) => ({
      name,
      image: `ghcr.io/${repository}/${manifestNameToImageName(name)}`,
      ...(hasDockerBuild(settings, name) && { docker_build: dockerBuildFor(settings, name, { preview: true }) })
    })),
    seed_ssh_host: previews.seed?.ssh_host ?? "",
    seed_command: fill(previews.seed?.command ?? ""),
    // scp resolves relative remote paths against the home dir, `~` is not expanded everywhere
    seed_upload: Object.entries(previews.seed?.upload ?? {}).map(([source, target]) => ({
      source,
      target: fill(target).replace(/^~\//, "")
    })),
    cleanup_command: fill(previews.cleanup_command ?? "")
  }
}

export interface PreviewPullRequest {
  number: number
  state: string
  mergeable: boolean | null
  merge_commit_sha: string | null
  head: { sha: string; ref: string }
}

// github computes `mergeable` lazily: the first read after a push is often
// null, so poll until it settles
export async function fetchMergeablePullRequest(opts: {
  apiUrl: string
  repository: string
  pr: number | string
  token: string
  attempts?: number
  delayMs?: number
}): Promise<PreviewPullRequest> {
  const attempts = opts.attempts ?? 12
  for (let i = 1; ; i++) {
    const res = await fetch(`${opts.apiUrl}/repos/${opts.repository}/pulls/${opts.pr}`, {
      headers: {
        Authorization: `Bearer ${opts.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    })
    if (!res.ok) throw new Error(`pull request #${opts.pr}: github api error ${res.status}: ${await res.text()}`)

    const pr = (await res.json()) as PreviewPullRequest
    if (pr.state !== "open") throw new Error(`pull request #${opts.pr} is ${pr.state}, not open`)
    if (pr.mergeable === false) throw new Error(`pull request #${opts.pr} has merge conflicts — resolve them to get a preview`)
    if (pr.mergeable === true && pr.merge_commit_sha) return pr
    if (i >= attempts) throw new Error(`github did not compute mergeability of #${opts.pr} in time — re-run the workflow`)

    await Bun.sleep(opts.delayMs ?? 5_000)
  }
}
