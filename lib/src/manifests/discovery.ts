import type { Dirent } from "node:fs"
import * as fs from "node:fs/promises"
import * as path from "node:path"

import type { Manifest } from "./registry"
import { getAdapters } from "./registry"

export const DEFAULT_EXCLUDE = new Set([
  "node_modules",
  ".git",
  ".github",
  "dist",
  "build",
  "out",
  "target",
  ".next"
])

export async function findManifests<R = Manifest & { path: string }>(
  dir: string,
  opts: { exclude?: Set<string>; results?: R[] } = {}
): Promise<R[]> {
  const exclude = opts.exclude || DEFAULT_EXCLUDE
  const results = opts.results || []
  const targetFilenames = new Set(
    getAdapters().map((a) => a.fileName).filter(Boolean)
  )

  let entries: Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return results
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name)

    if (entry.isFile() && targetFilenames.has(entry.name)) {
      const manifest = await parseManifest(full)
      // null means the file is not a versioned module on its own
      if (manifest) results.push({ ...manifest, path: full } as R)
    } else if (entry.isDirectory() && !exclude.has(entry.name)) {
      await findManifests(full, { exclude, results })
    }
  }

  return results
}

export async function parseManifest(filePath: string): Promise<Manifest | null> {
  const fileName = path.basename(filePath)
  const adapter = getAdapters().find((a) => a.fileName === fileName)
  if (!adapter) throw new Error(`no manifest adapter for file: ${filePath}`)

  const content = await fs.readFile(filePath, "utf-8")
  return adapter.parseManifest(content)
}

// a scope names a manifest by its full name, then by its name without the npm scope
// (`canvas` for `@acme/canvas`), then by an alias. the first tier with a match wins,
// so a scope another manifest also lists as an alias still names its own package;
// an alias several manifests share names them all.
export function findManifestsByScope<M extends Manifest>(manifests: M[], scope: string): M[] {
  const tiers: ((m: M) => boolean)[] = [
    (m) => m.name === scope,
    (m) => m.name.split("/").pop() === scope,
    (m) => m.scopeAliases.includes(scope) || !!m.gitCommitScopeRelatedNames?.includes(scope)
  ]
  for (const matches of tiers) {
    const found = manifests.filter(matches)
    if (found.length > 0) return found
  }
  return []
}

export function findManifestByName<M extends Manifest>(manifests: M[], name: string): M | undefined {
  return findManifestsByScope(manifests, name)[0]
}

export async function updateManifest(
  filePath: string,
  newVersion: string
): Promise<void> {
  const fileName = path.basename(filePath)
  const adapter = getAdapters().find((a) => a.fileName === fileName)
  if (!adapter) throw new Error(`no manifest adapter for file: ${filePath}`)

  const content = await fs.readFile(filePath, "utf-8")
  const updated = await adapter.setManifestVersion(content, newVersion)
  await fs.writeFile(filePath, updated, "utf-8")
  await adapter.updateRelatedFiles?.(filePath, newVersion)
}

export function getManifestSearchDir(): string {
  const argv = process.argv.slice(2)
  const dirArgIndex = argv.findIndex((a) => !a.startsWith("-"))
  return dirArgIndex >= 0 ? path.resolve(argv[dirArgIndex]) : process.cwd()
}
