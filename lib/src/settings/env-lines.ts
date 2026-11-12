import { fillRefs, type RenderContext } from "./docker-build"

const SECRET_REF = /\$\{\{\s*secrets\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g

export interface FilledEnvLines {
  /** KEY=value lines, blank lines and comments dropped */
  lines: string[]
  /** keys whose value came (partly) from a secret: log them without the value */
  secretKeys: Set<string>
  /** the secret values filled in, to mask */
  usedSecrets: string[]
  /** unset references, e.g. "secrets.NAME" */
  missing: string[]
}

/** fills `${{ vars.NAME }}` / `${{ secrets.NAME }}` in .env lines, e.g. deploy.ssh.env passed through as text */
export function fillEnvLines(text: string, ctx: RenderContext): FilledEnvLines {
  const out: FilledEnvLines = { lines: [], secretKeys: new Set(), usedSecrets: [], missing: [] }

  for (const line of text.split("\n")) {
    if (line.trim() === "" || line.trim().startsWith("#")) continue
    if (!line.includes("${{")) {
      out.lines.push(line)
      continue
    }

    const eq = line.indexOf("=")
    const key = eq > 0 ? line.slice(0, eq) : line
    const value = fillRefs(eq > 0 ? line.slice(eq + 1) : "", ctx, out.missing)
    if (value.includes("\n")) throw new Error(`${key}: a filled-in value must be a single line`)

    for (const [, name] of line.matchAll(SECRET_REF)) {
      out.secretKeys.add(key)
      const secret = ctx.secrets[name]
      if (secret) out.usedSecrets.push(secret)
    }
    out.lines.push(`${key}=${value}`)
  }
  return out
}
