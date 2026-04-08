// manifests/index.ts
// ---
// manifest discovery and manipulation.
// recursively scans a directory tree for known manifest files
// (package.json, pom.xml), parses them, and provides helpers
// for looking up and updating individual manifests.
// ---

import type { Dirent } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"

import type { Manifest } from "./handle"
import { manifestModules } from "./handle"

export type { Manifest }

// --- constants ---

const TARGET_FILENAMES = new Set(
  manifestModules.map((m) => m.fileName).filter(Boolean)
)

const DEFAULT_EXCLUDE = new Set([
  "node_modules",
  ".git",
  ".github",
  "dist",
  "build",
  "out",
  "target",
  ".next"
])

// --- discovery ---
// walks the file tree starting at `dir`, collecting every manifest
// that matches a registered handler.  skips common non-source dirs.

export async function findManifests<R = Manifest & { path: string }>(
  dir: string,
  opts: { exclude?: Set<string>; results?: R[] } = {}
): Promise<R[]> {
  const exclude = opts.exclude || DEFAULT_EXCLUDE
  const results = opts.results || []

  let entries: Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return results
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name)

    if (entry.isFile() && TARGET_FILENAMES.has(entry.name)) {
      results.push({ ...(await parseManifest(full)), path: full } as R)
    } else if (entry.isDirectory() && !exclude.has(entry.name)) {
      await findManifests(full, { exclude, results })
    }
  }

  return results
}

// --- parsing ---
// delegates to the handler module that matches the file name.

export async function parseManifest(filePath: string): Promise<Manifest> {
  const fileName = path.basename(filePath)
  const handler = manifestModules.find((m) => m.fileName === fileName)
  if (!handler) throw new Error(`no manifest handler for file: ${filePath}`)

  const content = await fs.readFile(filePath, "utf-8")
  return handler.parseManifest(content)
}

// --- lookup ---
// finds a manifest by its `name` or by a related scope alias.

export function findManifestByName(
  manifests: Manifest[],
  name: string
): Manifest | undefined {
  return manifests.find(
    (m) =>
      m.name === name ||
      m.gitCommitScopeRelatedNames?.includes(name)
  )
}

// --- update ---
// rewrites the version field in a manifest file on disk.

export async function updateManifest(
  filePath: string,
  newVersion: string
): Promise<void> {
  const fileName = path.basename(filePath)
  const handler = manifestModules.find((m) => m.fileName === fileName)
  if (!handler) throw new Error(`no manifest handler for file: ${filePath}`)

  const content = await fs.readFile(filePath, "utf-8")
  const updated = await handler.setManifestVersion(content, newVersion)
  await fs.writeFile(filePath, updated, "utf-8")
}

// --- cli helper ---
// reads the manifest search directory from argv, defaulting to cwd.

export function getManifestSearchDir(): string {
  const argv = process.argv.slice(2)
  const dirArgIndex = argv.findIndex((a) => !a.startsWith("-"))
  return dirArgIndex >= 0 ? path.resolve(argv[dirArgIndex]) : process.cwd()
}
