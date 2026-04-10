// handle.package-json.ts
// ---
// manifest handler for `package.json` files.
// reads name, version, and custom properties (priority, DockerfilePath,
// gitCommitScopeRelatedNames) from the `properties` field.
// ---

import type { Manifest, ManifestModule } from "./index"

export default {
  fileName: "package.json",

  // --- parse ---
  // extracts manifest metadata from a raw package.json string.

  async parseManifest(fileContent: string): Promise<Manifest> {
    const pkg = JSON.parse(fileContent)
    const props = pkg.properties ?? {}

    return {
      name: pkg.name,
      version: pkg.version,
      priority: props.priority,
      DockerfilePath: props.DockerfilePath,
      gitCommitScopeRelatedNames: props.gitCommitScopeRelatedNames
        ? props.gitCommitScopeRelatedNames.split(",").map((s: string) => s.trim())
        : undefined
    }
  },

  // --- update version ---
  // replaces the `version` field and re-serialises with 2-space indent.

  async setManifestVersion(fileContent: string, version: string): Promise<string> {
    const pkg = JSON.parse(fileContent)
    pkg.version = version
    return JSON.stringify(pkg, null, 2)
  }
} as ManifestModule

