// tag-n-push.ts
// ---
// creates a local git tag and pushes it to the remote.
// used after version bumps to publish release tags.
// ---

import { $ } from "bun";

export async function tagAndPush(tagName: string): Promise<void> {
  await $`git tag ${tagName}`;
  await $`git push origin ${tagName}`;
}
