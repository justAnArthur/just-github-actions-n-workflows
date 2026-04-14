// adapters/maven.ts
// ---
// manifest adapter for maven `pom.xml` files.
// uses the xml codec in order-preserving mode so that comments and
// element ordering survive a parse → modify → build round-trip.
// ---

import { registerAdapter, type Manifest, type ManifestAdapter } from "../registry"
import * as xmlCodec from "../../codecs/xml"

// --- xml node helpers ---

function findTagValue(nodes: any[], tag: string): string {
  const node = nodes.find((n) => n[tag])
  return node?.[tag]?.[0]?.["#text"]
}

function setTagValue(nodes: any[], tag: string, value: string) {
  const node = nodes.find((n) => n[tag])
  if (node) {
    if (Array.isArray(node[tag]) && node[tag][0]) node[tag][0]["#text"] = value
    else node[tag] = [{ "#text": value }]
  } else {
    nodes.push({ [tag]: [{ "#text": value }] })
  }
}

// --- helper ---
// unwraps the `<project>` element from the parsed json tree.

function getProjectArray(pomJson: any): any[] {
  const entry = Array.isArray(pomJson)
    ? pomJson.find((n: any) => n.project)
    : pomJson

  const arr = entry?.project
  if (!Array.isArray(arr)) throw new Error("invalid pom.xml structure — missing <project>")
  return arr
}

// --- adapter ---

const mavenAdapter: ManifestAdapter = {
  fileName: "pom.xml",

  // --- parse ---

  async parseManifest(fileContent: string): Promise<Manifest> {
    const pomJson = xmlCodec.pomXmlToJson(fileContent)
    const project = getProjectArray(pomJson)

    const name =
      findTagValue(project, "name") ||
      findTagValue(project, "artifactId") ||
      "unknown"

    const version = findTagValue(project, "version")

    const props = project.find((n) => n["properties"])?.["properties"] ?? []
    const priorityStr = findTagValue(props, "priority")
    const scopeNames = findTagValue(props, "gitCommitScopeRelatedNames")

    const scopeAliases = scopeNames
      ? scopeNames.split(",").map((s) => s.trim())
      : []

    // --- infer deploy targets ---
    const dockerfilePath = findTagValue(props, "DockerfilePath") ?? findTagValue(props, "dockerfilePath")
    const dockerContext = findTagValue(props, "dockerContext")
    const deployTargets: string[] = []
    if (dockerfilePath) deployTargets.push("docker")
    if (findTagValue(props, "vercelProjectId")) deployTargets.push("vercel")

    // allow explicit override via <deployTargets> property (comma-separated)
    const explicitStr = findTagValue(props, "deployTargets")
    const explicitTargets = explicitStr
      ? explicitStr.split(",").map((s) => s.trim()).filter(Boolean)
      : null

    return {
      name,
      version,
      priority: priorityStr ? parseInt(priorityStr, 10) : undefined,
      dockerfilePath,
      dockerContext,
      scopeAliases,
      deployTargets: explicitTargets ?? deployTargets,
      gitCommitScopeRelatedNames: scopeAliases.length > 0 ? scopeAliases : undefined
    }
  },

  // --- update version ---

  async setManifestVersion(fileContent: string, version: string): Promise<string> {
    const pomJson = xmlCodec.pomXmlToJson(fileContent)
    const project = getProjectArray(pomJson)
    setTagValue(project, "version", version)
    return xmlCodec.jsonToPomXml(pomJson)
  }
}

registerAdapter(mavenAdapter)

export default mavenAdapter


