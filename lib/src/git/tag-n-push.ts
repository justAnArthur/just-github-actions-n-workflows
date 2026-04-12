// tag-n-push.ts
// ---
// creates a local git tag and pushes it to the remote.
// supports annotated tags with JSON metadata in the tag message.
// used after version bumps to publish release tags.
// ---

import { $ } from "bun"

// --- tag annotation metadata ---
// structured metadata embedded in annotated tag messages.
// downstream workflows read this to decide which deploy jobs to run.

export type TagAnnotation = {
  deployTargets: string[];
}

// --- tag and push ---
// creates a git tag and pushes it. when `annotation` is provided,
// creates an annotated tag (`git tag -a`) with JSON metadata in the
// message body. otherwise creates a lightweight tag.

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

// --- read tag annotation ---
// reads the annotation message from an existing tag and parses it
// as JSON. returns null for lightweight tags or when the message
// is not valid JSON (backwards compatible with old tags).

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
