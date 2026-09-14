import * as path from "node:path"
import type { Manifest } from "../manifests"
import { findManifests, findManifestByName } from "../manifests"

// --- types ---

export type ManifestType = "npm" | "maven" | string

export type Module = {
  name: string;
  version: string;
  dir: string;
  manifestPath: string;
  manifestType: ManifestType;
  dockerfilePath: string | undefined;
  dockerContext: string | undefined;
  deployTargets: string[];
  scopeAliases: string[];
  priority: number | undefined;
  manifest: Manifest;
};

function detectManifestType(filePath: string): ManifestType {
  const fileName = path.basename(filePath)
  switch (fileName) {
    case "package.json": return "npm"
    case "pom.xml": return "maven"
    default: return fileName
  }
}

export async function discoverModules(
  dir: string,
  opts?: { exclude?: Set<string> }
): Promise<Module[]> {
  const manifests = await findManifests(dir, opts)

  return manifests.map((m: Manifest & { path: string }) => ({
    name: m.name,
    version: m.version,
    dir: path.dirname(m.path),
    manifestPath: m.path,
    manifestType: detectManifestType(m.path),
    dockerfilePath: m.dockerfilePath,
    dockerContext: m.dockerContext,
    deployTargets: m.deployTargets ?? [],
    scopeAliases: m.scopeAliases ?? [],
    priority: m.priority,
    manifest: m
  }))
}

export function findModuleByScope(
  modules: Module[],
  scope: string
): Module | undefined {
  return modules.find(
    (m) =>
      m.name === scope ||
      m.scopeAliases.includes(scope)
  )
}

// --- re-exports ---

export { findManifestByName } from "../manifests"
export type { Manifest } from "../manifests"
