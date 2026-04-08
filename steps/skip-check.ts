// skip-check.ts
// ---
// step: guard against workflow re-triggering loops.
//
// checks two signals:
//   1. the latest commit message contains `[skip bump]`
//   2. the committer email matches a bot pattern (github-actions / [bot])
//
// note: for most workflows this binary is *not* needed — prefer a
// job-level `if:` condition in the workflow yaml instead (see
// workflow.example.yaml).  this binary exists as a defence-in-depth
// fallback.
//
// exit codes:
//    0 — proceed normally
//   78 — skip (neutral exit; github actions treats it as success)
// ---

import { $ } from "bun";
import { log, setOutput } from "./_lib/github";

const message = (await $`git log -1 --pretty=%B`.text()).trim();
const committer = (await $`git log -1 --pretty=%ce`.text()).trim();

const skipByMessage = message.includes("[skip bump]");
const skipByBot =
  committer.includes("github-actions") || committer.includes("[bot]");

if (skipByMessage || skipByBot) {
  const reason = skipByMessage
    ? "commit message contains [skip bump]"
    : `committer is bot (${committer})`;

  log.info(`skipping workflow: ${reason}`);
  setOutput("skip", "true");
  process.exit(78);
} else {
  log.info(`last commit: "${message}" by ${committer} — no skip marker found`);
  setOutput("skip", "false");
}
