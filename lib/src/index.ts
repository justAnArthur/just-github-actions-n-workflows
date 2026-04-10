// index.ts
// ---
// barrel export for @justanarthur/actions-lib.
// re-exports the most commonly used symbols from the library.
// for deeper imports, use subpath exports like:
//   import { exec } from "@justanarthur/just-github-actions-n-workflows-lib/exec"
//   import { parseSemver } from "@justanarthur/just-github-actions-n-workflows-lib/version/parse-semver"
// ---

export { exec, execWithTimeout } from "./exec"
export { log, setOutput, setEnv, getEnv, getRequiredEnv } from "./github"

