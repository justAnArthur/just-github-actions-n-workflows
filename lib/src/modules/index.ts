// modules/index.ts
// ---
// unified module abstraction.
// a `Module` wraps a parsed manifest with additional context:
// its resolved directory, manifest type, and a higher-level API.
// this is the consumer-facing type — workflows and actions work
// with `Module` rather than raw `Manifest`.
//
// the module system auto-discovers all project modules by scanning
// for manifests and enriching them with directory and type info.
// ---

import * as path from "node:path"
import type { Manifest } from "../manifests"
import { findManifests, findManifestByName } from "../manifests"

// --- types ---

export type ManifestType = "npm" | "maven" | string

export type Module = {
  /** module name from the manifest (e.g. "@scope/backend") */
  name: string;
  /** current version string */
  version: string;
  /** resolved directory containing the manifest */
  dir: string;
  /** absolute path to the manifest file */
  manifestPath: string;
  /** which adapter parsed this manifest */
  manifestType: ManifestType;
  /** relative or absolute path to the Dockerfile, if declared */
  dockerfilePath: string | undefined;
  /** override for the Docker build context directory (relative to module dir) */
  dockerContext: string | undefined;
  /** deployment targets inferred from the manifest (e.g. ["npm", "docker", "vercel"]) */
  deployTargets: string[];
  /** commit scope aliases for this module */
  scopeAliases: string[];
  /** optional build priority (lower = build first) */
  priority: number | undefined;
  /** the raw parsed manifest data */
  manifest: Manifest;
};

// --- manifest type detection ---

function detectManifestType(filePath: string): ManifestType {
  const fileName = path.basename(filePath)
  switch (fileName) {
    case "package.json": return "npm"
    case "pom.xml": return "maven"
    default: return fileName
  }
}

// --- discovery ---
// scans a directory for all manifests and maps each to a Module.

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

// --- lookup ---
// finds a module by name or scope alias.

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

