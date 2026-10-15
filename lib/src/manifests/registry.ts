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
  /** null means the file is not a versioned module and must be skipped */
  parseManifest(fileContent: string): Manifest | null | Promise<Manifest | null>;
  setManifestVersion(fileContent: string, version: string): string | Promise<string>;
  /** called after the manifest file was rewritten (lock files etc.) */
  updateRelatedFiles?(manifestPath: string, version: string): Promise<void>;
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
