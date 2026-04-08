// fetch-tags.ts
// ---
// step: fetch all git tags and ensure a full (non-shallow) history.
// should run early in workflows that need tag-based version logic.
//
// env: (none — runs unconditionally)
// ---

import { $ } from "bun"
import { log } from "./_lib/github"

log.info("fetching all tags...")
await $`git fetch --tags --force`

// repos cloned with `--depth` have a `.git/shallow` sentinel file.
// unshallow so that `git log` and `git rev-list` see the full history.
const isShallow = (await $`test -f .git/shallow && echo "yes" || echo "no"`.text()).trim()

if (isShallow === "yes") {
  log.info("repository is shallow — unshallowing...")
  await $`git fetch --unshallow`
}

log.info("tags and full history fetched")
