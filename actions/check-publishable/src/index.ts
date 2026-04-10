// check-publishable/src/index.ts
// ---
// checks whether a package is publishable by reading its package.json.
// a package is publishable when `private` is not `true`.
// outputs skip=true when the package should not be published.
// ---

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { getRequiredEnv, log, setOutput } from "@justanarthur/just-github-actions-n-workflows-lib/github"

log.group("check-publishable")

const dir = getRequiredEnv("PKG_DIR")
const pkgPath = join(dir, "package.json")

log.info(`checking: ${pkgPath}`)

let pkg: any
try {
  pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
} catch (err) {
  log.error(`could not read ${pkgPath}: ${err}`)
  setOutput("skip", "true")
  log.groupEnd()
  process.exit(0)
}

log.info(`name: ${pkg.name}`)
log.info(`private: ${pkg.private ?? "(not set)"}`)
log.info(`publishConfig: ${pkg.publishConfig ? JSON.stringify(pkg.publishConfig) : "(not set)"}`)

if (pkg.private === true) {
  log.info(`${pkg.name} is private — skipping publish`)
  setOutput("skip", "true")
} else {
  log.info(`${pkg.name} is publishable`)
  setOutput("skip", "false")
}

log.groupEnd()
