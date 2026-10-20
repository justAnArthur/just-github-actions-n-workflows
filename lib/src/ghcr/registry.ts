import { log } from "../github"

const MANIFEST_ACCEPT = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.docker.distribution.manifest.v2+json"
].join(", ")

export function parseImageRef(ref: string): { registry: string; path: string; tag: string } {
  const at = ref.lastIndexOf(":")
  const slash = ref.indexOf("/")
  if (slash < 0 || at < slash) throw new Error(`image ref needs a registry and a tag: "${ref}"`)
  return { registry: ref.slice(0, slash), path: ref.slice(slash + 1, at), tag: ref.slice(at + 1) }
}

export async function imageExists(ref: string, token: string): Promise<boolean> {
  const { registry, path, tag } = parseImageRef(ref)

  const tokenRes = await fetch(
    `https://${registry}/token?service=${registry}&scope=repository:${path}:pull`,
    { headers: token ? { Authorization: `Basic ${btoa(`token:${token}`)}` } : {} }
  )
  if (tokenRes.status === 401 || tokenRes.status === 403) return false
  if (!tokenRes.ok) throw new Error(`${registry} token request failed: ${tokenRes.status} ${await tokenRes.text()}`)
  const { token: bearer } = (await tokenRes.json()) as { token: string }

  const res = await fetch(`https://${registry}/v2/${path}/manifests/${tag}`, {
    method: "HEAD",
    headers: { Authorization: `Bearer ${bearer}`, Accept: MANIFEST_ACCEPT }
  })
  if (res.ok) return true
  // ghcr answers 401/403 instead of 404 for a package that doesn't exist yet
  if ([401, 403, 404].includes(res.status)) return false
  throw new Error(`${registry} manifest request for ${ref} failed: ${res.status}`)
}

export async function waitForImages(
  refs: string[],
  token: string,
  opts: { timeoutMs: number; intervalMs?: number }
): Promise<string[]> {
  const deadline = Date.now() + opts.timeoutMs
  let pending = [...refs]

  while (true) {
    const still: string[] = []
    for (const ref of pending) {
      if (await imageExists(ref, token)) log.info(`found ${ref}`)
      else still.push(ref)
    }
    pending = still
    if (pending.length === 0 || Date.now() >= deadline) return pending

    log.info(`waiting for ${pending.join(", ")}`)
    await Bun.sleep(opts.intervalMs ?? 15_000)
  }
}
