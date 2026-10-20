export function singleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

// double quotes keep `$VAR` working as before; only the characters that
// would end or escape the quoting are escaped
function doubleQuote(value: string): string {
  return `"${value.replace(/[\\"`]/g, "\\$&")}"`
}

// a remote path as one shell word: a quoted `~/x` is not tilde-expanded, so
// a leading `~` becomes `$HOME`
export function remoteShellPath(path: string): string {
  if (path === "~") return `"$HOME"`
  if (path.startsWith("~/")) return doubleQuote(`$HOME/${path.slice(2)}`)
  return doubleQuote(path)
}

// scp resolves a relative remote path against the home directory, in both the
// legacy and the sftp protocol, while `~` is only expanded by some servers
export function scpRemotePath(path: string): string {
  if (path === "~" || path === "~/") return "."
  if (path.startsWith("~/")) return path.slice(2)
  return path
}
