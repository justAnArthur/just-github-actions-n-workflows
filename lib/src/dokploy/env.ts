function keyOf(line: string): string | undefined {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith("#")) return undefined
  const eq = trimmed.indexOf("=")
  return eq > 0 ? trimmed.slice(0, eq).trim() : undefined
}

export function parseEnvLines(text: string): Map<string, string> {
  const entries = new Map<string, string>()
  for (const raw of text.split(/\r?\n/)) {
    const key = keyOf(raw)
    if (key) entries.set(key, raw.trim())
  }
  return entries
}

// the compose env also holds secrets set by hand in dokploy, so only the keys in
// `updates` are touched and every other line survives byte for byte
export function mergeEnv(existing: string, updates: string): string {
  const pending = parseEnvLines(updates)
  const lines = existing ? existing.split(/\r?\n/) : []
  const trailingNewline = lines.length > 0 && lines[lines.length - 1] === ""
  if (trailingNewline) lines.pop()

  const replaced = new Set<string>()
  const merged = lines.map((line) => {
    const key = keyOf(line)
    if (!key || !pending.has(key)) return line
    replaced.add(key)
    return pending.get(key)!
  })

  for (const [key, line] of pending) {
    if (!replaced.has(key)) merged.push(line)
  }

  return merged.join("\n") + (trailingNewline ? "\n" : "")
}
