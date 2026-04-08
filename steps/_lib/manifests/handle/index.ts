// handle/index.ts
// ---
// manifest type definitions and module registry.
// each supported manifest format (package.json, pom.xml) provides a
// module that knows how to parse and update the version field.
// ---

export type Manifest = {
  name: string;
  version: string;
  priority: number | undefined;
  DockerfilePath: string | undefined;
  gitCommitScopeRelatedNames?: string[];
};

export type ManifestModule = {
  fileName: string;
  parseManifest(fileContent: string): Manifest | Promise<Manifest>;
  setManifestVersion(fileContent: string, version: string): string | Promise<string>;
};

// --- registry ---
// order matters: the first module whose `fileName` matches wins.

import packageJsonModule from "./handle.package-json"
import pomXmlModule from "./handle.pom-xml"

export const manifestModules: ManifestModule[] = [
  packageJsonModule,
  pomXmlModule
]
