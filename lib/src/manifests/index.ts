export type { DeployTarget, Manifest, ManifestAdapter, ManifestModule } from "./registry"
export { registerAdapter, getAdapters } from "./registry"

// importing these modules triggers their self-registration.
import "./adapters/npm"
import "./adapters/maven"

export { findManifests, parseManifest, findManifestByName, updateManifest, getManifestSearchDir } from "./discovery"
