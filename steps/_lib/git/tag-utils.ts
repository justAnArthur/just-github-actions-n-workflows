// tag-utils.ts
// ---
// common utilities for working with git tags in `<module>@<version>` format.
// ---

// --- versionFromTag ---
// extracts the version portion from a tag: `@scope/pkg@1.2.3` → `1.2.3`
// for tags without `@`, returns the tag itself.

export function versionFromTag(tag: string): string {
  const lastAt = tag.lastIndexOf("@")
  return lastAt > 0 ? tag.slice(lastAt + 1) : tag
}

// --- moduleFromTag ---
// extracts the module name from a tag: `@scope/pkg@1.2.3` → `@scope/pkg`
// for tags without `@`, returns an empty string.

export function moduleFromTag(tag: string): string {
  const lastAt = tag.lastIndexOf("@")
  return lastAt > 0 ? tag.slice(0, lastAt) : ""
}

// --- cleanTagRef ---
// strips `refs/tags/` and `refs/heads/` prefixes from a git ref.

export function cleanTagRef(ref: string): string {
  return ref
    .replace(/^refs\/tags\//, "")
    .replace(/^refs\/heads\//, "")
    .trim()
}

// --- isPrerelease ---
// returns true if the version string contains a prerelease identifier.

export function isPrerelease(version: string): boolean {
  return /-(canary|rc|alpha|beta)/i.test(version)
}

