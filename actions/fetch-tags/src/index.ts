import { $ } from "bun"
import { log } from "@justanarthur/actions-lib/github"

log.group("git-fetch-and-unshallow")

log.info("fetching all tags...")
await $`git fetch --tags --force`

const isShallow = (await $`test -f .git/shallow && echo "yes" || echo "no"`.text()).trim()

if (isShallow === "yes") {
  log.info("repository is shallow — unshallowing...")
  await $`git fetch --unshallow`
} else {
  log.info("repository is already full-depth")
}

log.info("tags and full history fetched")
log.groupEnd()

