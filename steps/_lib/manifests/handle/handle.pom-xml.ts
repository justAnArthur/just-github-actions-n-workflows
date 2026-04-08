// handle.pom-xml.ts
// ---
// manifest handler for maven `pom.xml` files.
// uses the xml codec in order-preserving mode so that comments and
// element ordering survive a parse → modify → build round-trip.
// ---

import type { Manifest, ManifestModule } from "./index";
import * as xmlCodec from "../../codecs/xml";

// --- xml node helpers ---

function findTagValue(nodes: any[], tag: string): string {
  const node = nodes.find((n) => n[tag]);
  return node?.[tag]?.[0]?.["#text"];
}

function setTagValue(nodes: any[], tag: string, value: string) {
  const node = nodes.find((n) => n[tag]);
  if (node) {
    if (Array.isArray(node[tag]) && node[tag][0]) node[tag][0]["#text"] = value;
    else node[tag] = [{ "#text": value }];
  } else {
    nodes.push({ [tag]: [{ "#text": value }] });
  }
}

// --- helper ---
// unwraps the `<project>` element from the parsed json tree.

function getProjectArray(pomJson: any): any[] {
  const entry = Array.isArray(pomJson)
    ? pomJson.find((n: any) => n.project)
    : pomJson;

  const arr = entry?.project;
  if (!Array.isArray(arr)) throw new Error("invalid pom.xml structure — missing <project>");
  return arr;
}

// --- module ---

export default {
  fileName: "pom.xml",

  // --- parse ---

  async parseManifest(fileContent: string): Promise<Manifest> {
    const pomJson = xmlCodec.pomXmlToJson(fileContent);
    const project = getProjectArray(pomJson);

    const name =
      findTagValue(project, "name") ||
      findTagValue(project, "artifactId") ||
      "unknown";

    const version = findTagValue(project, "version");

    const props = project.find((n) => n["properties"])?.["properties"] ?? [];
    const priorityStr = findTagValue(props, "priority");
    const scopeNames = findTagValue(props, "gitCommitScopeRelatedNames");

    return {
      name,
      version,
      priority: priorityStr ? parseInt(priorityStr, 10) : undefined,
      DockerfilePath: findTagValue(props, "DockerfilePath"),
      gitCommitScopeRelatedNames: scopeNames
        ? scopeNames.split(",").map((s) => s.trim())
        : undefined,
    };
  },

  // --- update version ---

  async setManifestVersion(fileContent: string, version: string): Promise<string> {
    const pomJson = xmlCodec.pomXmlToJson(fileContent);
    const project = getProjectArray(pomJson);
    setTagValue(project, "version", version);
    return xmlCodec.jsonToPomXml(pomJson);
  },
} as ManifestModule;

