import * as fs from "node:fs/promises"
import * as path from "node:path"

import { registerAdapter, type Manifest, type ManifestAdapter } from "../registry"
import { DEFAULT_EXCLUDE } from "../discovery"

type CargoModule = {
  kind: "crate" | "workspace"
  name: string
  /** [package].name — the name Cargo.lock keys entries by */
  packageName: string | undefined
  version: string
  props: Record<string, any>
}

function isInheritedVersion(value: unknown): boolean {
  // version.workspace = true parses as { workspace: true }
  return (
    typeof value === "object" && value !== null && !Array.isArray(value) &&
    (value as any).workspace === true
  )
}

// single decision point used by parse, setManifestVersion and updateRelatedFiles
function classifyCargoModule(parsed: any): CargoModule | null {
  const pkg = parsed?.package
  if (typeof pkg?.version === "string") {
    const props = pkg.metadata?.justactions ?? {}
    const name = props.name ?? pkg.name
    if (!name) return null
    return { kind: "crate", name, packageName: pkg.name, version: pkg.version, props }
  }

  const workspacePkg = parsed?.workspace?.package
  if (typeof workspacePkg?.version === "string") {
    const props = parsed.workspace.metadata?.justactions ?? {}
    const name = props.name ?? pkg?.name
    if (!name) return null
    return {
      kind: "workspace",
      name,
      packageName: pkg?.name,
      version: workspacePkg.version,
      props
    }
  }

  // member crate inheriting version.workspace, virtual workspace without
  // version, or version omitted — not a versioned module on its own
  return null
}

function toStringList(value: unknown): string[] | null {
  if (value == null) return null
  if (Array.isArray(value)) return value.map((v) => String(v).trim())
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return null
    return trimmed.split(",").map((s) => s.trim())
  }
  return null
}

function quotedValueOf(line: string): string | null {
  const m = /=\s*(["'])(.*)\1/.exec(line)
  return m ? m[2] : null
}

// replace only the version value in the given table, preserving formatting
// and comments; never re-serializes the whole TOML
function replaceTableVersion(content: string, header: string, version: string): string {
  const lines = content.split("\n")
  const headerIndex = lines.findIndex((l) => l.trim() === header)
  if (headerIndex === -1) throw new Error(`cargo: table header ${header} not found`)

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim().startsWith("[")) break // next table header
    const m = /^(\s*version\s*=\s*)(["'])(.*)\2(.*)$/.exec(line)
    if (m) {
      lines[i] = `${m[1]}${m[2]}${version}${m[2]}${m[4]}`
      return lines.join("\n")
    }
  }

  throw new Error(`cargo: no version line found in ${header} table`)
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

// walk up from startDir; stop after a directory containing .git, or at the root
async function findCargoLock(startDir: string): Promise<string | null> {
  let dir = path.resolve(startDir)
  for (;;) {
    const candidate = path.join(dir, "Cargo.lock")
    if (await fileExists(candidate)) return candidate
    if (await fileExists(path.join(dir, ".git"))) return null
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

async function parseTomlFile(p: string): Promise<any> {
  return Bun.TOML.parse(await fs.readFile(p, "utf-8")) as any
}

// collect package names of member crates inheriting the workspace version,
// skipping excluded dirs and nested workspaces of their own
async function collectInheritedCrateNames(dir: string, names: Set<string>): Promise<void> {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || DEFAULT_EXCLUDE.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    const manifest = path.join(full, "Cargo.toml")
    if (await fileExists(manifest)) {
      const parsed = await parseTomlFile(manifest)
      if (parsed?.workspace) continue // nested workspace, not ours
      if (isInheritedVersion(parsed?.package?.version) && parsed.package.name) {
        names.add(parsed.package.name)
      }
    }
    await collectInheritedCrateNames(full, names)
  }
}

// rewrite only version lines of local [[package]] blocks; every other byte stays
function rewriteLockVersions(content: string, names: Set<string>, version: string): string {
  const lines = content.split("\n")
  const starts: number[] = []
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "[[package]]") starts.push(i)
  }

  for (let b = 0; b < starts.length; b++) {
    const from = starts[b] + 1
    const to = b + 1 < starts.length ? starts[b + 1] : lines.length
    const block = lines.slice(from, to)

    const nameLine = block.find((l) => /^\s*name\s*=/.test(l))
    const name = nameLine ? quotedValueOf(nameLine) : null
    if (!name || !names.has(name)) continue
    // registry and git crates carry a source line; their versions are not ours
    if (block.some((l) => /^\s*source\s*=/.test(l))) continue

    for (let i = from; i < to; i++) {
      const m = /^(\s*version\s*=\s*)(["'])(.*)\2(.*)$/.exec(lines[i])
      if (m) {
        lines[i] = `${m[1]}${m[2]}${version}${m[2]}${m[4]}`
        break
      }
    }
  }

  return lines.join("\n")
}

const cargoAdapter: ManifestAdapter = {
  fileName: "Cargo.toml",

  async parseManifest(fileContent: string): Promise<Manifest | null> {
    const mod = classifyCargoModule(Bun.TOML.parse(fileContent))
    if (!mod) return null

    const props = mod.props
    const scopeAliases = toStringList(props.gitCommitScopeRelatedNames) ?? []

    const dockerfilePath = props.DockerfilePath ?? props.dockerfilePath
    const deployTargets: string[] = []
    if (dockerfilePath) deployTargets.push("docker")
    if (props.vercelProjectId) deployTargets.push("vercel")

    // allow explicit override via metadata.justactions.deployTargets
    const explicitTargets = toStringList(props.deployTargets)?.filter(Boolean) ?? null

    return {
      name: mod.name,
      version: mod.version,
      priority: typeof props.priority === "number" ? props.priority : undefined,
      dockerfilePath,
      dockerContext: props.dockerContext,
      scopeAliases,
      deployTargets: explicitTargets ?? deployTargets,
      gitCommitScopeRelatedNames: scopeAliases.length > 0 ? scopeAliases : undefined
    }
  },

  async setManifestVersion(fileContent: string, version: string): Promise<string> {
    const mod = classifyCargoModule(Bun.TOML.parse(fileContent))
    if (!mod) throw new Error("cargo: manifest is not a versioned module")

    const header = mod.kind === "crate" ? "[package]" : "[workspace.package]"
    return replaceTableVersion(fileContent, header, version)
  },

  async updateRelatedFiles(manifestPath: string, version: string): Promise<void> {
    const parsed = await parseTomlFile(manifestPath)
    const mod = classifyCargoModule(parsed)
    if (!mod) return

    const lockPath = await findCargoLock(path.dirname(manifestPath))
    if (!lockPath) return

    // ci runs cargo with --locked; the lock must match the bumped manifests
    const names = new Set<string>()
    if (mod.kind === "crate") {
      if (mod.packageName) names.add(mod.packageName)
    } else {
      if (isInheritedVersion(parsed?.package?.version) && parsed.package.name) {
        names.add(parsed.package.name)
      }
      await collectInheritedCrateNames(path.dirname(manifestPath), names)
    }
    if (names.size === 0) return

    const lockContent = await fs.readFile(lockPath, "utf-8")
    const updated = rewriteLockVersions(lockContent, names, version)
    if (updated !== lockContent) await fs.writeFile(lockPath, updated, "utf-8")
  }
}

registerAdapter(cargoAdapter)

export default cargoAdapter
