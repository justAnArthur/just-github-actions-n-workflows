# Copilot Instructions

## Project overview

This is a **release automation toolkit** built as composite GitHub Actions powered by **Bun**.
It provides reusable actions, workflow templates, a shared library, and a CLI — all in one monorepo.

The repo ships three things:
1. **Composite GitHub Actions** (`actions/`) — individual steps for CI/CD pipelines
2. **Workflow templates** (`workflows/`) — complete CI/CD pipelines that orchestrate the actions
3. **CLI** (`cli/`) — an npm-published interactive tool to scaffold workflows into any repo

## Architecture

```
├── lib/                    # Shared library (@justanarthur/actions-lib)
│                           # All reusable logic lives here: git utils, semver, manifests, etc.
│
├── actions/                # Composite GitHub Actions (each is a workspace package)
│   └── <action>/
│       ├── action.yml      # GitHub Action definition (composite)
│       ├── package.json    # Workspace package (private, depends on @justanarthur/actions-lib)
│       ├── tsconfig.json   # Extends ../../tsconfig.base.json
│       └── src/index.ts    # Entry point (run via `bun run`)
│
├── cli/                    # npm-published CLI package (@justanarthur/just-github-actions-n-workflows)
│   ├── package.json        # Public package, uses oclif + @inquirer/prompts
│   └── src/
│       ├── index.ts        # oclif entry point
│       ├── github.ts       # GitHub API helpers
│       └── commands/
│           └── init.ts     # The `init` command (default)
│
├── workflows/              # Workflow YAML templates (source of truth)
├── .github/workflows/      # Auto-synced copies (via pre-commit hook)
└── .githooks/pre-commit    # Syncs workflows/ → .github/workflows/
```

## Workspace structure

This is a **Bun workspace monorepo**. The root `package.json` defines:
```json
{ "workspaces": ["lib", "actions/*", "cli"] }
```

- **root** → `@justanarthur/just-github-actions-n-workflows` (private, workspace root)
- **`lib/`** → `@justanarthur/just-github-actions-n-workflows-lib` (private, workspace-only)
- **`actions/*`** → `@justanarthur/step-*` (private, workspace-only)
- **`cli/`** → `@justanarthur/just-github-actions-n-workflows-cli` (public, published to npm)

## Strict rules

### Code style
- **Runtime**: Bun (not Node.js). Use Bun APIs when available.
- **Language**: TypeScript, ESM (`"type": "module"` everywhere).
- **No compilation step**: Actions run directly via `bun run src/index.ts` — no build/bundle needed.
- **Imports**: Use subpath imports from the lib, e.g. `@justanarthur/actions-lib/git/tag-utils`, not deep relative paths.
- **Comments**: Use the `// --- section ---` comment style for file sections. Each file starts with a header comment block explaining its purpose.
- **No code duplication**: All shared logic must live in `lib/`. Actions import from `@justanarthur/actions-lib`. Never copy code between actions or between actions and lib.

### Shared library (`lib/`)
- This is the **single source of truth** for all reusable logic.
- Exports are defined via subpath exports in `package.json`:
  - `./*` → `./src/*.ts`
  - `./git/*` → `./src/git/*.ts`
  - `./version/*` → `./src/version/*.ts`
  - `./manifests` → `./src/manifests/index.ts`
  - `./codecs/*` → `./src/codecs/*.ts`
  - etc.
- When adding new shared functionality, add it here and create a matching export path.
- Dependencies like `fast-xml-parser` belong in the lib, not in individual actions.

### Actions (`actions/`)
- Every action **must** have: `action.yml`, `package.json`, `tsconfig.json`, `src/index.ts`.
- `action.yml` uses `runs.using: composite` and runs the TypeScript directly via `bun run`.
- `package.json` must be `"private": true` and depend on `"@justanarthur/just-github-actions-n-workflows-lib": "workspace:*"`.
- `tsconfig.json` must extend `../../tsconfig.base.json`.
- Actions read inputs via environment variables (`process.env`) and write outputs via `setOutput()` from the lib.
- Actions install dependencies from the workspace root: `bun install --frozen-lockfile` with `working-directory: ${{ github.action_path }}/../..`.

### Workflows (`workflows/`)
- **`workflows/` is the source of truth**. Never edit `.github/workflows/` directly.
- The pre-commit hook (`.githooks/pre-commit`) auto-syncs selected workflows to `.github/workflows/`.
- Every workflow YAML must start with a header comment block containing: description, usage example, and `required secrets:` section.
- Workflows support three trigger types: `push`, `workflow_dispatch`, `workflow_call`.

### CLI (`cli/`)
- Built with **oclif** (`@oclif/core`) and **@inquirer/prompts**.
- This is the only public (published to npm) package in the monorepo.
- The CLI fetches workflow files dynamically from the GitHub API — it does NOT bundle workflow YAML files.
- Reads repository URL from `package.json` — no hardcoded repo references.

### Git hooks
- Hooks live in `.githooks/` (tracked in the repo).
- Activate via: `git config core.hooksPath .githooks`
- The pre-commit hook syncs workflow templates to `.github/workflows/` and stages them.

### Versioning
- All workspace packages share the same version (set in each `package.json`).
- Versions are bumped automatically by the `bump-version` workflow based on conventional commit messages.
- Commit messages are parsed by `lib/src/git/conventional-commit-parser.ts`.
- See `.github/copilot-commit-message-instructions.md` for the commit message format.

### Manifests
- Version bumps target **manifest files** (`package.json`, `pom.xml`).
- The manifest system discovers all manifest files recursively and matches them by `name` or `gitCommitScopeRelatedNames`.
- The `properties.gitCommitScopeRelatedNames` field in `package.json` maps commit scopes to packages (comma-separated).

### Tags
- Git tags follow the `<package-name>@<version>` format (e.g. `@justanarthur/just-github-actions-n-workflows@1.0.0`).
- Tags are created automatically by the bump-version workflow after updating manifest versions.
- Tag pushes trigger the publish workflows.

### Testing
- Tests use Bun's built-in test runner (`bun test`).
- Test files live alongside source code (e.g. `lib/tests/`) or in action directories.
- Run all tests: `bun test --recursive actions/ lib/ cli/`

## When creating a new action

1. Create `actions/<name>/action.yml` with composite steps (setup bun, install deps, run index.ts)
2. Create `actions/<name>/package.json` — private, depends on `@justanarthur/actions-lib`
3. Create `actions/<name>/tsconfig.json` — extends `../../tsconfig.base.json`
4. Create `actions/<name>/src/index.ts` — import from `@justanarthur/actions-lib/*`
5. Run `bun install` to link the new workspace package
6. Run `bun run build` to validate the action structure
7. Add the action to the README table

## When creating a new workflow

1. Create `workflows/<name>.yml` with the standard header comment block
2. Include `push`, `workflow_dispatch`, and `workflow_call` triggers
3. Document required secrets in the header comment (parsed by the CLI)
4. Add the workflow file to the `SYNC_WORKFLOWS` array in `.githooks/pre-commit` if it should be auto-synced
5. Update the README workflows table

## Key file references

| File | Purpose |
|------|---------|
| `lib/src/git/conventional-commit-parser.ts` | Parses commit messages into structured data |
| `lib/src/version/calculate-semver.ts` | Semver bump logic + commit type → bump level mapping |
| `lib/src/manifests/index.ts` | Manifest discovery, parsing, updating |
| `lib/src/github.ts` | GitHub Actions runtime helpers (setOutput, log, getEnv) |
| `lib/src/exec.ts` | Shell command execution with timeout |
| `actions/bump-version/src/index.ts` | Main version bump orchestrator |
| `.githooks/pre-commit` | Workflow sync hook |
| `.github/copilot-commit-message-instructions.md` | Commit message format rules |

