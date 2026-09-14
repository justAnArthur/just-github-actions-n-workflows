# Contributing

Thanks for taking the time to contribute. This repo is a generic CI/CD toolkit — bug reports, fixes, and new manifest adapters are all welcome.

## Ground rules

- All commits must follow the project's [conventional commit format](.github/git-commit-instructions.md) — type and scope are mandatory.
- Code style lives in [`.github/copilot-instructions.md`](.github/copilot-instructions.md). The short version: TypeScript, ESM, Bun, no banner comments, no docblocks on non-public exports.
- Shared logic belongs in `lib/`. Do not duplicate code between actions.
- Keep PRs focused. One concern per PR — separate bug fixes from new features from refactors.

## Local setup

```bash
git clone https://github.com/justAnArthur/just-github-actions-n-workflows.git
cd just-github-actions-n-workflows
git config core.hooksPath .githooks   # enables the workflow sync hook
bun install
```

The pre-commit hook keeps `.github/workflows/` in sync with `workflows/`. If you only edit files outside `workflows/`, you don't need the hook.

## Verifying your change

```bash
bun run build    # validates every action's action.yml + package.json shape
bun test         # runs lib + action tests (43/43 currently)
```

Both must exit 0 before you open a PR.

## Adding a new manifest adapter

1. Create `lib/src/manifests/adapters/<name>.ts`.
2. Implement the `ManifestAdapter` interface (`fileName`, `parseManifest`, `setManifestVersion`).
3. Call `registerAdapter()` at module scope.
4. Import the adapter in `lib/src/manifests/index.ts` so the side-effect registration runs.
5. Add a fixture-based test under `lib/tests/`.
6. Update `README.md` so the manifest configuration section documents the new format.

The adapter must populate `deployTargets` on the parsed `Manifest` — either infer them from the manifest content or respect an explicit override property.

## Adding a new composite action

1. Create `actions/<action-name>/` with `action.yml`, `package.json`, `tsconfig.json`, and `src/index.ts`.
2. `package.json` must set `"private": true` and include `"@justanarthur/just-github-actions-n-workflows-lib": "workspace:*"` under `dependencies`.
3. `action.yml` should follow the existing pattern: composite action with `oven-sh/setup-bun@v2`, install step, and `bun run ${{ github.action_path }}/src/index.ts`.
4. Add `properties.gitCommitScopeRelatedNames` in `package.json` so commits to your action can bump its version.
5. Document it in `README.md` under "available actions".

`bun run build` validates these. Don't skip it.

## Opening a PR

- Branch from `main`.
- Push and open a PR against `main`.
- Describe what changed and why. Reference any issue it closes.
- All three checks (build, test, conventional-commit lint if any) must pass.

## Release process

Merging a PR to `main` does NOT trigger a release by itself — releases are driven explicitly via `workflow_dispatch` on the `bump-version` workflow. Maintainers will cut a release when there's enough meaningful change. Do not push version tags manually.
