import { $ } from "bun"

// --- tag annotation metadata ---

export type TagAnnotation = {
  deployTargets: string[];
}

export async function tagAndPush(
  tagName: string,
  annotation?: TagAnnotation
): Promise<void> {
  if (annotation) {
    const message = JSON.stringify(annotation)
    await $`git tag -a ${tagName} -m ${message}`
  } else {
    await $`git tag ${tagName}`
  }
  await $`git push origin ${tagName}`
}

export async function readTagAnnotation(
  tagName: string
): Promise<TagAnnotation | null> {
  try {
    const result = await $`git tag -l --format=${"%(contents)"} ${tagName}`.quiet()
    const text = result.text().trim()
    if (!text) return null
    const parsed = JSON.parse(text)
    if (parsed && Array.isArray(parsed.deployTargets)) {
      return parsed as TagAnnotation
    }
    return null
  } catch {
    return null
  }
}
