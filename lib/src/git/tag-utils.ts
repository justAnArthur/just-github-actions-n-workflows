export function versionFromTag(tag: string): string {
  const lastAt = tag.lastIndexOf("@")
  return lastAt > 0 ? tag.slice(lastAt + 1) : tag
}

export function moduleFromTag(tag: string): string {
  const lastAt = tag.lastIndexOf("@")
  return lastAt > 0 ? tag.slice(0, lastAt) : ""
}

export function cleanTagRef(ref: string): string {
  return ref
    .replace(/^refs\/tags\//, "")
    .replace(/^refs\/heads\//, "")
    .trim()
}

export function isPrerelease(version: string): boolean {
  return /-(canary|rc|alpha|beta)/i.test(version)
}

export function prereleaseChannel(version: string): string | undefined {
  const match = version.match(/-(canary|rc|alpha|beta)/i)
  return match ? match[1].toLowerCase() : undefined
}
