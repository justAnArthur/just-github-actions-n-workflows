# Copilot Instructions

## Project overview

This is a **generic, versioned CI/CD workflow toolkit** built as composite GitHub Actions powered by **Bun**.
It provides reusable actions, workflow templates, a shared library, and a CLI — all in one monorepo.

The repo is designed as a collection of **installable/updatable workflows** that work with project **modules**.
Each module has its own **manifest** (in different languages/systems: `package.json`, `pom.xml`, …) that is
parsed into a unified `Module` object used across all workflows. The manifest system is pluggable — new
manifest formats can be added as adapters.

The repo ships three things:
1. **Composite GitHub Actions** (`actions/`) — individual steps for CI/CD pipelines
2. **Workflow templates** (`workflows/`) — complete CI/CD pipelines that orchestrate the actions
3. **CLI** (`cli/`) — an npm-published interactive tool to scaffold workflows into any repo

## Architecture

```
├── lib/                    # Shared library (@justanarthur/actions-lib)
│   ├── src/
│   │   ├── manifests/      # Pluggable manifest system (types, registry, discovery)
│   │   │   ├── index.ts    # Manifest/ManifestAdapter types + adapter registry
│   │   │   ├── discovery.ts # Recursive manifest scanner
│   │   │   └── adapters/   # One file per manifest format
│   │   │       ├── npm.ts  # package.json adapter
│   │   │       └── maven.ts # pom.xml adapter
│   │   ├── modules/        # Unified module abstraction
│   │   │   └── index.ts    # Module type + discoverModules() + findModuleByScope()
│   │   ├── settings/       # Project settings (.justactions.yml)
│   │   │   └── index.ts    # Settings type + loadSettings() + resolveDeployTarget()
│   │   ├── codecs/         # File format codecs
│   │   │   └── xml.ts      # XML round-trip codec (fast-xml-parser)
│   │   ├── git/            # Git utilities
│   │   ├── ghcr/           # Container registry utilities
│   │   └── version/        # Semver utilities
│   │
├── actions/                # Composite GitHub Actions (each is a workspace package)
│   └── <action>/
│       ├── action.yml      # GitHub Action definition (composite)
│       ├── package.json    # Workspace package (private, depends on @justanarthur/actions-lib)
│       ├── tsconfig.json   # Extends ../../tsconfig.base.json
│       └── src/index.ts    # Entry point (run via `bun run`)
│
├── cli/                    # npm-published CLI package
│
├── workflows/              # Workflow YAML templates (source of truth)
├── .justactions.yml        # Example project settings file
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
- **Imports**: Use subpath imports from the lib, e.g. `@justanarthur/just-github-actions-n-workflows-lib/modules`, not deep relative paths or cross-action imports.
- **Comments**: Use the `// --- section ---` comment style for file sections. Each file starts with a header comment block explaining its purpose.
- **No code duplication**: All shared logic must live in `lib/`. Actions import from lib. Never copy code between actions or import from one action to another.

### Shared library (`lib/`)
- This is the **single source of truth** for all reusable logic.
- Exports are defined via subpath exports in `package.json`:
  - `./*` → `./src/*.ts`
  - `./git/*` → `./src/git/*.ts`
  - `./version/*` → `./src/version/*.ts`
  - `./manifests` → `./src/manifests/index.ts`
  - `./manifests/*` → `./src/manifests/*.ts`
  - `./modules` → `./src/modules/index.ts`
  - `./settings` → `./src/settings/index.ts`
  - `./codecs/*` → `./src/codecs/*.ts`
- When adding new shared functionality, add it here and create a matching export path.
- Dependencies like `fast-xml-parser` belong in the lib, not in individual actions.

### Manifests and Modules
- **Manifests** are low-level: they represent the raw parsed data from a manifest file.
- **Modules** are the consumer-facing type: they wrap a manifest with directory, type, and scope aliases.
- The manifest system uses a **pluggable adapter registry** (`registerAdapter()`).
- Built-in adapters (npm, maven) auto-register via import side effects in `lib/src/manifests/index.ts`.
- To add a new manifest format: create `lib/src/manifests/adapters/<name>.ts`, implement `ManifestAdapter`, call `registerAdapter()`, and import it in `lib/src/manifests/index.ts`.

### Settings file (`.justactions.yml`)
- Per-project configuration file that workflows read for deploy targets, module overrides, etc.
- Loaded by `lib/src/settings/index.ts` — searches up from cwd to find the file.
- Used by `resolve-deploy-config` action to replace hardcoded environment configs.
- Schema includes `deploy.targets` (host, compose_profiles, profiles, timezone) and `modules.overrides`.

### Actions (`actions/`)
- Every action **must** have: `action.yml`, `package.json`, `tsconfig.json`, `src/index.ts`.
- `action.yml` uses `runs.using: composite` and runs the TypeScript directly via `bun run`.
- `package.json` must be `"private": true` and depend on `"@justanarthur/just-github-actions-n-workflows-lib": "workspace:*"`.
- **Actions must NOT depend on other actions** — all shared logic lives in `lib/`.
- `tsconfig.json` must extend `../../tsconfig.base.json`.
- Actions read inputs via environment variables (`process.env`) and write outputs via `setOutput()` from the lib.
- Actions install dependencies from the workspace root: `bun install --frozen-lockfile` with `working-directory: ${{ github.action_path }}/../..`.

### Workflows (`workflows/`)
- **`workflows/` is the source of truth**. Never edit `.github/workflows/` directly.
- The pre-commit hook (`.githooks/pre-commit`) auto-syncs selected workflows to `.github/workflows/` based on `.github/workflows/sync-from-root-workflows`.
- Every workflow YAML must start with a header comment block containing: description, usage example, and `required secrets:` section.
- Workflows support three trigger types: `push`, `workflow_dispatch`, `workflow_call`.
- **No inline bash scripts in workflows.** Any logic beyond trivial shell one-liners **must** be extracted into a dedicated action in `actions/`. Workflows should only orchestrate actions, not contain business logic.
- Workflows must be **generic** — no hardcoded project-specific values. Use `.justactions.yml` settings or workflow inputs for project-specific config.

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
- Version bumps target **manifest files** (`package.json`, `pom.xml`, …).
- The manifest system discovers all manifest files recursively and matches them by `name` or `scopeAliases`.
- The `properties.gitCommitScopeRelatedNames` field in `package.json` maps commit scopes to packages (comma-separated). This is the legacy name; `scopeAliases` is the canonical field on the `Manifest` type.

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
2. Create `actions/<name>/package.json` — private, depends only on `@justanarthur/just-github-actions-n-workflows-lib`
3. Create `actions/<name>/tsconfig.json` — extends `../../tsconfig.base.json`
4. Create `actions/<name>/src/index.ts` — import from `@justanarthur/just-github-actions-n-workflows-lib/*`
5. Run `bun install` to link the new workspace package
6. Run `bun run build` to validate the action structure
7. Add the action to the README table

## When creating a new workflow

1. Create `workflows/<name>.yml` with the standard header comment block
2. Include `push`, `workflow_dispatch`, and `workflow_call` triggers
3. Document required secrets in the header comment (parsed by the CLI)
4. Ensure all config is generic (use `.justactions.yml` or inputs, no hardcoded values)
5. Add the workflow file to the `SYNC_WORKFLOWS` array in `.githooks/pre-commit` if it should be auto-synced
6. Update the README workflows table

## When adding a new manifest adapter

1. Create `lib/src/manifests/adapters/<name>.ts`
2. Implement the `ManifestAdapter` interface: `fileName`, `parseManifest()`, `setManifestVersion()`
3. Call `registerAdapter()` at module scope to self-register
4. Import the adapter file in `lib/src/manifests/index.ts` (side-effect import)
5. Update the README "adding a new manifest adapter" section

## Key file references

| File | Purpose |
|------|---------|
| `lib/src/manifests/index.ts` | Manifest types + adapter registry |
| `lib/src/manifests/discovery.ts` | Recursive manifest discovery + parsing + updating |
| `lib/src/manifests/adapters/npm.ts` | package.json manifest adapter |
| `lib/src/manifests/adapters/maven.ts` | pom.xml manifest adapter |
| `lib/src/modules/index.ts` | Unified Module type + discovery + lookup |
| `lib/src/settings/index.ts` | Settings file loader (.justactions.yml) |
| `lib/src/codecs/xml.ts` | XML round-trip codec |
| `lib/src/git/conventional-commit-parser.ts` | Parses commit messages into structured data |
| `lib/src/version/calculate-semver.ts` | Semver bump logic + commit type → bump level mapping |
| `lib/src/github.ts` | GitHub Actions runtime helpers (setOutput, log, getEnv) |
| `lib/src/exec.ts` | Shell command execution with timeout |
| `actions/bump-version/src/index.ts` | Main version bump orchestrator |
| `.justactions.yml` | Project settings file (deploy targets, module overrides) |
| `.githooks/pre-commit` | Workflow sync hook |
| `.github/copilot-commit-message-instructions.md` | Commit message format rules |

