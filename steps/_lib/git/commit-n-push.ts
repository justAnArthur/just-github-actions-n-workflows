// commit-n-push.ts
// ---
// stages all changes in the given directory, commits, and pushes.
// the default commit message includes `[skip bump]` to prevent
// re-triggering the bump-version workflow.
// ---

import { $ } from "bun";

export async function commitAndPush(
  dir: string = ".",
  message?: string,
): Promise<void> {
  const commitMessage =
    message || `chore[skip bump]: updating manifests in ${dir}`;

  await $`git add ${dir}`;
  await $`git commit -m ${commitMessage}`;
  await $`git push`;
}
