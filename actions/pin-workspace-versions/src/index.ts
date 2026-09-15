// pin-workspace-versions/src/index.ts
// ---
// rewrites a package's `workspace:` protocol dependencies to the concrete
// versions of its sibling workspace packages.
//
// why: `bun publish` substitutes `workspace:*` deps using the version
// recorded in the lockfile. after a version bump the lockfile can be stale
// (it is not refreshed by `bun install` short of a full re-resolve), so the
// published manifest ends up pinning the *previous* — sometimes
// non-existent — versions of sibling packages. resolving against each
// sibling's live manifest version right before publish makes the published
// dependency ranges deterministic and registry-resolvable.
// ---

import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { findManifests } from "@justanarthur/just-github-actions-n-workflows-lib/manifests"
import { getEnv, getRequiredEnv, log } from "@justanarthur/just-github-actions-n-workflows-lib/github"

log.group("pin-workspace-versions")

const dir = getRequiredEnv("PKG_DIR")
const root = getEnv("GITHUB_WORKSPACE", process.cwd())
const pkgPath = join(dir, "package.json")

// build a name → version map of every workspace package in the repo
const manifests = await findManifests(root)
const versions = new Map<string, string>()
for (const m of manifests) {
  if (m.name) versions.set(m.name, m.version)
}
log.info(`discovered ${versions.size} workspace package(s)`)

let pkg: any
try {
  pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
} catch (err) {
  log.error(`could not read ${pkgPath}: ${err}`)
  log.groupEnd()
  process.exit(1)
}

const DEP_FIELDS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies"
] as const

// map a `workspace:` spec onto a concrete range using the sibling version.
//   workspace:*  → 1.2.3      workspace:^ → ^1.2.3      workspace:~ → ~1.2.3
//   workspace:<range> → <range>   (already concrete; kept verbatim)
function resolveSpec(spec: string, version: string): string {
  const rest = spec.slice("workspace:".length)
  if (rest === "" || rest === "*") return version
  if (rest === "^") return `^${version}`
  if (rest === "~") return `~${version}`
  return rest
}

let changed = 0
for (const field of DEP_FIELDS) {
  const deps = pkg[field]
  if (!deps || typeof deps !== "object") continue

  for (const [name, spec] of Object.entries(deps as Record<string, string>)) {
    if (typeof spec !== "string" || !spec.startsWith("workspace:")) continue

    const version = versions.get(name)
    if (!version) {
      log.warn(`${name}: workspace dependency not found among manifests — leaving "${spec}" as-is`)
      continue
    }

    const resolved = resolveSpec(spec, version)
    deps[name] = resolved
    log.info(`${field}: ${name} ${spec} → ${resolved}`)
    changed++
  }
}

if (changed > 0) {
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  log.info(`rewrote ${changed} workspace dependency spec(s) in ${pkgPath}`)
} else {
  log.info("no workspace: dependencies to rewrite")
}

log.groupEnd()
