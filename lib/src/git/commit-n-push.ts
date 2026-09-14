import { $ } from "bun"

export async function commitAndPush(
  dir: string = ".",
  message?: string
): Promise<void> {
  const commitMessage =
    message || `chore[skip bump]: updating manifests in ${dir}`

  await $`git add ${dir}`
  await $`git commit -m ${commitMessage}`
  await $`git push`
}

