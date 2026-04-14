// manifests/registry.ts
// ---
// manifest adapter types and registry.
// this file is separate from index.ts to avoid circular imports
// between the registry and the adapters that register themselves.
// ---

// --- types ---

export type DeployTarget = "npm" | "docker" | "vercel" | string

export type Manifest = {
  name: string;
  version: string;
  priority: number | undefined;
  dockerfilePath: string | undefined;
  /** override for the Docker build context directory (relative to manifest dir) */
  dockerContext: string | undefined;
  scopeAliases: string[];
  /** deployment targets inferred from the manifest (e.g. ["npm", "docker", "vercel"]) */
  deployTargets: DeployTarget[];
  /** @deprecated use `scopeAliases` */
  gitCommitScopeRelatedNames?: string[];
};

export type ManifestAdapter = {
  fileName: string;
  parseManifest(fileContent: string): Manifest | Promise<Manifest>;
  setManifestVersion(fileContent: string, version: string): string | Promise<string>;
};

/** @deprecated use ManifestAdapter */
export type ManifestModule = ManifestAdapter;

// --- adapter registry ---
// adapters auto-register when imported. the first adapter whose
// `fileName` matches a discovered file wins.

const adapters: ManifestAdapter[] = []

export function registerAdapter(adapter: ManifestAdapter): void {
  adapters.push(adapter)
}

export function getAdapters(): ManifestAdapter[] {
  return adapters
}

