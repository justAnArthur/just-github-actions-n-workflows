// conventional-commit-parser.ts
// ---
// parses conventional commit messages into structured data.
// supports multi-item commits (several `type(scope): subject` lines),
// extracts jira-style ticket references, and separates header/footer.
//
// grammar:
//   <type>[!][(scope)]: <subject>
//   [body]
//   [footer]
// ---

export type CommitItem = {
  type: string;
  scope: string | null;
  subject: string;
  body: string;
  raw: string;
};

export type ParsedCommit = {
  raw: string;
  jira: string[];
  header: string | null;
  items: CommitItem[];
  footer: string | null;
};

// --- parser ---

const CONVENTIONAL_RE =
  /^(?<type>[a-zA-Z0-9+-]+)(?<breaking>!)?(?:\((?<scope>[^)]+)\))?:\s*(?<subject>.+)$/

// matches jira-style ticket ids like `PROJ-123`
const JIRA_RE = /([A-Z][A-Z0-9]+-\d+)/g

export function parseCommitMessage(raw: string): ParsedCommit {
  const lines = raw.replace(/\r\n/g, "\n").split("\n")

  // find all lines that match the conventional commit pattern
  const conventionalIndices: number[] = []
  lines.forEach((line, i) => {
    if (CONVENTIONAL_RE.test(line.trim())) conventionalIndices.push(i)
  })

  const firstIdx = conventionalIndices.length ? conventionalIndices[0] : -1
  const lastIdx = conventionalIndices.length
    ? conventionalIndices[conventionalIndices.length - 1]
    : -1

  // everything before the first conventional line is the header
  const header =
    firstIdx > -1
      ? lines.slice(0, firstIdx).join("\n").trim()
      : lines.join("\n").trim()

  // everything after the last conventional line is the footer
  const footer =
    lastIdx > -1 ? lines.slice(lastIdx + 1).join("\n").trim() : ""

  // extract jira tickets from the entire message
  const jiraMatches: string[] = []
  let match: RegExpExecArray | null
  while ((match = JIRA_RE.exec(raw)) !== null) {
    jiraMatches.push(match[1])
  }

  // parse each conventional line into a structured item
  const items: CommitItem[] = []

  for (let k = 0; k < conventionalIndices.length; k++) {
    const idx = conventionalIndices[k]
    const line = lines[idx].trim()
    const m = line.match(CONVENTIONAL_RE)
    if (!m) continue

    const groups = m.groups || {}

    // body = lines between this item and the next conventional line
    const nextIndex =
      k + 1 < conventionalIndices.length
        ? conventionalIndices[k + 1]
        : lines.length
    let body = lines.slice(idx + 1, nextIndex).join("\n").trim()
    if (body === footer) body = "" // avoid duplicating footer content

    items.push({
      type: groups.type || "",
      scope: groups.scope || null,
      subject: (groups.subject || "").trim(),
      body,
      raw: line
    })
  }

  return {
    raw,
    jira: Array.from(new Set(jiraMatches)),
    header: header || null,
    items,
    footer: footer || null
  }
}

