export type CommitItem = {
  type: string;
  scope: string | null;
  scopes: string[];
  subject: string;
  body: string;
  raw: string;
  breaking: boolean;
};

export type ParsedCommit = {
  raw: string;
  jira: string[];
  header: string | null;
  items: CommitItem[];
  footer: string | null;
};

// "!" goes before the scope (feat!(x):) or, per the spec, after it (feat(x)!:)
const CONVENTIONAL_RE =
  /^(?<type>[a-zA-Z0-9+-]+)(?<bang>!)?(?:\((?<scope>[^)]+)\))?(?<bangAfterScope>!)?:\s*(?<subject>.+)$/

// a scopeless footer, not an item; `BREAKING-CHANGE(<scope>): …` stays an item of its own
const BREAKING_FOOTER_RE = /^BREAKING[ -]CHANGE:/

const JIRA_RE = /([A-Z][A-Z0-9]+-\d+)/g

export function parseCommitMessage(raw: string): ParsedCommit {
  const lines = raw.replace(/\r\n/g, "\n").split("\n")

  const conventionalIndices: number[] = []
  const breakingFooterIndices: number[] = []
  lines.forEach((line, i) => {
    const trimmed = line.trim()
    if (BREAKING_FOOTER_RE.test(trimmed)) breakingFooterIndices.push(i)
    else if (CONVENTIONAL_RE.test(trimmed)) conventionalIndices.push(i)
  })

  const firstIdx = conventionalIndices.length ? conventionalIndices[0] : -1
  const lastIdx = conventionalIndices.length
    ? conventionalIndices[conventionalIndices.length - 1]
    : -1

  const header =
    firstIdx > -1
      ? lines.slice(0, firstIdx).join("\n").trim()
      : lines.join("\n").trim()

  const footer =
    lastIdx > -1 ? lines.slice(lastIdx + 1).join("\n").trim() : ""

  const jiraMatches: string[] = []
  let match: RegExpExecArray | null
  while ((match = JIRA_RE.exec(raw)) !== null) {
    jiraMatches.push(match[1])
  }

  const items: CommitItem[] = []

  for (let k = 0; k < conventionalIndices.length; k++) {
    const idx = conventionalIndices[k]
    const line = lines[idx].trim()
    const m = line.match(CONVENTIONAL_RE)
    if (!m) continue

    const groups = m.groups || {}
    const rawScope = groups.scope || null
    const scopes = rawScope
      ? rawScope.split(",").map((s) => s.trim()).filter(Boolean)
      : []

    const nextIndex =
      k + 1 < conventionalIndices.length
        ? conventionalIndices[k + 1]
        : lines.length
    let body = lines.slice(idx + 1, nextIndex).join("\n").trim()
    if (body === footer) body = "" // avoid duplicating footer content

    items.push({
      type: groups.type || "",
      scope: scopes[0] ?? null,
      scopes,
      subject: (groups.subject || "").trim(),
      body,
      raw: line,
      breaking: Boolean(groups.bang || groups.bangAfterScope) || groups.type === "BREAKING-CHANGE"
    })
  }

  // a footer breaks the item it follows (the header line in a single-item commit)
  for (const footerIdx of breakingFooterIndices) {
    if (items.length === 0) break
    let k = 0
    while (k + 1 < conventionalIndices.length && conventionalIndices[k + 1] < footerIdx) k++
    items[k].breaking = true
  }

  return {
    raw,
    jira: Array.from(new Set(jiraMatches)),
    header: header || null,
    items,
    footer: footer || null
  }
}
