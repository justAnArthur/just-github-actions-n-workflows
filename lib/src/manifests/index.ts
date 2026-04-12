// manifests/index.ts
// ---
// unified manifest system.
// defines the core types for manifest parsing and provides a
// pluggable adapter registry. each supported manifest format
// (package.json, pom.xml, …) registers an adapter that knows
// how to parse and update the version field.
//
// to add a new manifest type, create an adapter in `./adapters/`
// and register it via `registerAdapter()`.
// ---

// --- re-export types and registry from registry.ts ---

export type { DeployTarget, Manifest, ManifestAdapter, ManifestModule } from "./registry"
export { registerAdapter, getAdapters } from "./registry"

// --- built-in adapters ---
// importing these modules triggers their self-registration.

import "./adapters/npm"
import "./adapters/maven"

// --- re-exports from discovery ---

export { findManifests, parseManifest, findManifestByName, updateManifest, getManifestSearchDir } from "./discovery"
