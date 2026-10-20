import { log } from "../github"
import { detectChannel } from "../version/calculate-semver"
import { parseSemver } from "../version/parse-semver"

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

export interface PrereleaseCleanup {
  channel: string
  // limit to one major, so promoting 5.x keeps the 6.0.0-beta images
  major?: number
}

export function isCleanupTag(tag: string, { channel, major }: PrereleaseCleanup): boolean {
  const parsed = parseSemver(tag)
  if (!parsed) return false
  if (detectChannel(parsed.prerelease)?.toLowerCase() !== channel.toLowerCase()) return false
  return major === undefined || parsed.major === major
}

const API_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28"
})

export class PackagesForbiddenError extends Error {}

// packages live under /orgs/<owner> for organizations and /users/<owner> for
// personal accounts; the org endpoint 404s for a user, so fall back to it
async function fetchAllVersions(
  owner: string,
  packageName: string,
  token: string
): Promise<{ versions: PackageVersion[]; base: string }> {
  const encoded = encodeURIComponent(packageName)

  for (const kind of ["orgs", "users"]) {
    const base = `${GITHUB_API}/${kind}/${owner}/packages/container/${encoded}/versions`
    const all: PackageVersion[] = []
    let page = 1
    const perPage = 100
    let missing = false

    while (true) {
      const res = await fetch(`${base}?per_page=${perPage}&page=${page}`, { headers: API_HEADERS(token) })

      if (!res.ok) {
        if (res.status === 404) {
          missing = true
          break
        }
        if (res.status === 401 || res.status === 403) {
          throw new PackagesForbiddenError(`github api error ${res.status}: ${await res.text()}`)
        }
        throw new Error(`github api error ${res.status}: ${await res.text()}`)
      }

      const versions = (await res.json()) as PackageVersion[]
      all.push(...versions)
      if (versions.length < perPage) break
      page++
    }

    if (!missing) return { versions: all, base }
  }

  log.info(`package "${packageName}" not found under "${owner}", skipping`)
  return { versions: [], base: "" }
}

async function deleteVersion(base: string, versionId: number, token: string): Promise<boolean> {
  const res = await fetch(`${base}/${versionId}`, { method: "DELETE", headers: API_HEADERS(token) })

  if (res.status === 204 || res.status === 200 || res.status === 404) return true
  if (res.status === 401 || res.status === 403) {
    throw new PackagesForbiddenError(`failed to delete version ${versionId}: ${res.status} ${await res.text()}`)
  }

  log.error(`failed to delete version ${versionId}: ${res.status} ${await res.text()}`)
  return false
}

// only digests where *every* tag is a prerelease of the promoted channel
// (and major) are removed — other channels, shared layers and untagged
// manifests are left untouched
export async function deletePrereleaseImages(
  owner: string,
  packageName: string,
  token: string,
  cleanup: PrereleaseCleanup = { channel: "canary" }
): Promise<number> {
  log.info(`listing versions for ${owner}/${packageName}...`)
  const { versions, base } = await fetchAllVersions(owner, packageName, token)
  log.info(`found ${versions.length} total version(s)`)

  let deleted = 0

  for (const v of versions) {
    const tags = v.metadata?.container?.tags ?? []

    // keep untagged manifests (shared layers)
    if (tags.length === 0) continue

    if (!tags.every((t) => isCleanupTag(t, cleanup))) continue

    log.info(`deleting version id=${v.id} tags=[${tags.join(", ")}]`)
    if (await deleteVersion(base, v.id, token)) deleted++
  }

  const scope = cleanup.major === undefined ? cleanup.channel : `${cleanup.channel} ${cleanup.major}.x`
  log.info(`deleted ${deleted} ${scope} prerelease version(s) for ${packageName}`)
  return deleted
}

// same key resolve-image-tags emits, e.g. `@scope/backend` -> DOCKER_SCOPE_BACKEND_IMAGE_TAG
export function imageTagEnvKey(moduleName: string): string {
  const segment = moduleName
    .replace(/^@/, "")
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
  return `DOCKER_${segment}_IMAGE_TAG`
}

// removes versions whose tags all start with the prefix (e.g. "pr-12-"); a
// version that also carries another tag (a release) is kept
export async function deleteImagesWithTagPrefix(
  owner: string,
  packageName: string,
  prefix: string,
  token: string
): Promise<number> {
  if (!prefix) throw new Error("refusing to delete images with an empty tag prefix")

  const { versions, base } = await fetchAllVersions(owner, packageName, token)
  let deleted = 0

  for (const v of versions) {
    const tags = v.metadata?.container?.tags ?? []
    if (tags.length === 0 || !tags.every((t) => t.startsWith(prefix))) continue

    log.info(`deleting ${packageName} version id=${v.id} tags=[${tags.join(", ")}]`)
    if (await deleteVersion(base, v.id, token)) deleted++
  }

  log.info(`deleted ${deleted} version(s) of ${packageName} tagged ${prefix}*`)
  return deleted
}
