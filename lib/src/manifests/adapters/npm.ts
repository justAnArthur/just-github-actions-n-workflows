// adapters/npm.ts
// ---
// manifest adapter for `package.json` files.
// reads name, version, and custom properties (priority, dockerfilePath,
// scopeAliases) from the `properties` field.
// ---

import { registerAdapter, type Manifest, type ManifestAdapter } from "../registry"

const npmAdapter: ManifestAdapter = {
  fileName: "package.json",

  // --- parse ---
  // extracts manifest metadata from a raw package.json string.

  async parseManifest(fileContent: string): Promise<Manifest> {
    const pkg = JSON.parse(fileContent)
    const props = pkg.properties ?? {}

    const scopeAliases = props.gitCommitScopeRelatedNames
      ? props.gitCommitScopeRelatedNames.split(",").map((s: string) => s.trim())
      : []

    // --- infer deploy targets ---
    const deployTargets: string[] = []
    if (pkg.private !== true) deployTargets.push("npm")
    if (props.DockerfilePath || props.dockerfilePath) deployTargets.push("docker")
    if (props.vercelProjectId) deployTargets.push("vercel")

    // allow explicit override via properties.deployTargets (comma-separated)
    const explicitTargets = props.deployTargets
      ? props.deployTargets.split(",").map((s: string) => s.trim()).filter(Boolean)
      : null

    return {
      name: pkg.name,
      version: pkg.version,
      priority: props.priority,
      dockerfilePath: props.DockerfilePath ?? props.dockerfilePath,
      scopeAliases,
      deployTargets: explicitTargets ?? deployTargets,
      gitCommitScopeRelatedNames: scopeAliases.length > 0 ? scopeAliases : undefined
    }
  },

  // --- update version ---
  // replaces the `version` field and re-serialises with 2-space indent.

  async setManifestVersion(fileContent: string, version: string): Promise<string> {
    const pkg = JSON.parse(fileContent)
    pkg.version = version
    return JSON.stringify(pkg, null, 2)
  }
}

registerAdapter(npmAdapter)

export default npmAdapter


