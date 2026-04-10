// co-authors.ts
// ---
// helpers for appending `Co-authored-by:` trailers to commit messages.
// GitHub uses these trailers to link commits to additional users.
// ---

export interface CoAuthor {
  name: string
  email: string
}

// the standard GitHub actions bot identity.
// appending this makes the bot avatar show up in commit history.
export const GITHUB_ACTIONS_BOT: CoAuthor = {
  name: "github-actions[bot]",
  email: "41898282+github-actions[bot]@users.noreply.github.com"
}

// formats a single co-author as a git trailer line.
function formatTrailer(author: CoAuthor): string {
  return `Co-authored-by: ${author.name} <${author.email}>`
}

// appends one or more co-author trailers to a commit message.
export function withCoAuthors(message: string, authors: CoAuthor[]): string {
  if (authors.length === 0) return message
  const trailers = authors.map(formatTrailer).join("\n")
  return `${message}\n\n${trailers}`
}

