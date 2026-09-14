export type DeployTarget = "npm" | "docker" | "vercel" | string

export type Manifest = {
  name: string;
  version: string;
  priority: number | undefined;
  dockerfilePath: string | undefined;
  dockerContext: string | undefined;
  scopeAliases: string[];
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

const adapters: ManifestAdapter[] = []

export function registerAdapter(adapter: ManifestAdapter): void {
  adapters.push(adapter)
}

export function getAdapters(): ManifestAdapter[] {
  return adapters
}
