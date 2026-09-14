export interface CoAuthor {
  name: string
  email: string
}

export const GITHUB_ACTIONS_BOT: CoAuthor = {
  name: "github-actions[bot]",
  email: "41898282+github-actions[bot]@users.noreply.github.com"
}

function formatTrailer(author: CoAuthor): string {
  return `Co-authored-by: ${author.name} <${author.email}>`
}

export function withCoAuthors(message: string, authors: CoAuthor[]): string {
  if (authors.length === 0) return message
  const trailers = authors.map(formatTrailer).join("\n")
  return `${message}\n\n${trailers}`
}
