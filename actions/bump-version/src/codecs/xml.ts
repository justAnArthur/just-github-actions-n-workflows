// xml.ts
// ---
// xml codec for pom.xml files.
// uses `fast-xml-parser` in order-preserving mode so that
// round-tripping (parse → modify → build) keeps the original
// element order and comments intact.
// ---

import { XMLBuilder, XMLParser } from "fast-xml-parser"

// --- parser ---
// order-preserving parser that keeps comments and avoids
// coercing tag values into numbers or booleans.

const parser = new XMLParser({
  ignoreAttributes: false,
  preserveOrder: true,
  commentPropName: "#comment",
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false
})

// --- builder ---
// reconstructs xml from the parsed json structure.
// uses 2-space indentation and suppresses self-closing empty nodes.

const builder = new XMLBuilder({
  ignoreAttributes: false,
  preserveOrder: true,
  commentPropName: "#comment",
  suppressEmptyNode: true,
  format: true,
  indentBy: "  ",
  processEntities: false,
  suppressBooleanAttributes: false
})

// --- public api ---

export function pomXmlToJson(xml: string) {
  return parser.parse(xml)
}

export function jsonToPomXml(json: any) {
  return builder.build(json)
}

