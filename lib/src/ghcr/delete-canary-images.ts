import { log } from "../github"

const GITHUB_API = "https://api.github.com"

interface PackageVersion {
  id: number;
  name: string;
  metadata?: {
    container?: {
      tags?: string[];
    };
  };
}

// converts a manifest name (e.g. `@camasys/backend_core`) to a
// ghcr-compatible image name (e.g. `camasys-backend_core`).
export function manifestNameToImageName(input: string): string {
  if (!input) return ""

  // strip version segment when there are 2+ `@` signs
  const hasVersion = (input.match(/@/g) || []).length >= 2

  return (hasVersion ? input.replace(/@[^@]+$/, "") : input)
    .replace(/^@/, "")
    .replace(/\//g, "-")
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
}

function isPrereleaseTag(tag: string): boolean {
  return /(canary|beta|alpha|rc)/i.test(tag)
}

async function fetchAllVersions(
  owner: string,
  packageName: string,
  token: string
): Promise<PackageVersion[]> {
  const all: PackageVersion[] = []
  let page = 1
  const perPage = 100
  const encoded = encodeURIComponent(packageName)

  while (true) {
    const url =
      `${GITHUB_API}/orgs/${owner}/packages/container/${encoded}/versions` +
      `?per_page=${perPage}&page=${page}`

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      }
    })

    if (!res.ok) {
      if (res.status === 404) {
        log.info(`package "${packageName}" not found under org "${owner}", skipping`)
        return []
      }
      throw new Error(`github api error ${res.status}: ${await res.text()}`)
    }

    const versions = (await res.json()) as PackageVersion[]
    all.push(...versions)
    if (versions.length < perPage) break
    page++
  }

  return all
}

async function deleteVersion(
  owner: string,
  packageName: string,
  versionId: number,
  token: string
): Promise<boolean> {
  const encoded = encodeURIComponent(packageName)
  const url =
    `${GITHUB_API}/orgs/${owner}/packages/container/${encoded}/versions/${versionId}`

  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  })

  if (res.status === 204 || res.status === 200 || res.status === 404) return true

  log.error(`failed to delete version ${versionId}: ${res.status} ${await res.text()}`)
  return false
}

// only digests where *every* tag is a prerelease tag are removed —
// shared layers and untagged manifests are left untouched
export async function deletePrereleaseImages(
  owner: string,
  packageName: string,
  token: string
): Promise<number> {
  log.info(`listing versions for ${owner}/${packageName}...`)
  const versions = await fetchAllVersions(owner, packageName, token)
  log.info(`found ${versions.length} total version(s)`)

  let deleted = 0

  for (const v of versions) {
    const tags = v.metadata?.container?.tags ?? []

    // keep untagged manifests (shared layers)
    if (tags.length === 0) continue

    if (!tags.every(isPrereleaseTag)) continue

    log.info(`deleting version id=${v.id} tags=[${tags.join(", ")}]`)
    if (await deleteVersion(owner, packageName, v.id, token)) deleted++
  }

  log.info(`deleted ${deleted} prerelease version(s) for ${packageName}`)
  return deleted
}
