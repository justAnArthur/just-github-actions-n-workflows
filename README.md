# just-github-actions-n-workflows

generic, versioned CI/CD workflow toolkit — version bumping, npm publishing, docker publishing, docker compose deployment.  
built as **composite GitHub Actions** powered by [Bun](https://bun.sh).

## overview

this is a repo of **generic, installable/updatable workflows** for project release automation.
each workflow works with project **modules** — independent packages within a monorepo (or single-repo), each with its own **manifest** (`package.json`, `pom.xml`, etc.) that is parsed into a unified `Module` object used across all workflows.

### core concepts

- **module** — a project component with its own manifest, version, and optional Dockerfile
- **manifest** — a file (`package.json`, `pom.xml`, …) that declares the module's name, version, and metadata
- **adapter** — a pluggable parser for each manifest type (npm, maven, … more to come)
- **settings file** (`.justactions.yml`) — per-project config for deploy targets, module overrides, etc.

## quick start

from any repo, scaffold the workflow files:

```bash
bunx just-github-actions-n-workflows init
```

```
$ bunx just-github-actions-n-workflows init

  create  .github/workflows/bump-version.yml
  create  .github/workflows/publish-npm-on-tag.yml
  create  .github/workflows/publish-docker-on-tag.yml

done — 3 created, 0 skipped

next steps:
  1. set the GH_TOKEN secret in your repo settings
  2. adjust push.branches / push.tags triggers for your repo
  3. commit and push: git add .github/ && git commit -m "ci: add workflows" && git push
```

install a specific workflow:

```bash
bunx just-github-actions-n-workflows init bump-version
bunx just-github-actions-n-workflows init publish-npm
bunx just-github-actions-n-workflows init release
bunx just-github-actions-n-workflows init deploy-docker-compose
bunx just-github-actions-n-workflows init --list
```

## settings file

create a `.justactions.yml` in your repo root to configure deploy targets and module overrides:

```yaml
# .justactions.yml
deploy:
  ssh_target_path: ~/my-app
  targets:
    production:
      host: app.example.com
      compose_profiles: "@scope/backend,@scope/frontend"
      profiles: "prod"
      timezone: Europe/Bratislava
    staging:
      host: staging.example.com
      compose_profiles: "@scope/backend"
      profiles: "staging"
      timezone: UTC

modules:
  overrides:
    - name: "@scope/backend"
      docker_compose_service: backend
```
  
### how modules work

each module is discovered by scanning the repo for manifest files. the unified `Module` type includes:

| field          | description                                        |
|----------------|----------------------------------------------------|
| `name`         | module name from the manifest                      |
| `version`      | current version string                             |
| `dir`          | resolved directory containing the manifest         |
| `manifestType` | which adapter parsed it (`npm`, `maven`, …)        |
| `dockerfilePath` | path to the Dockerfile (if declared in manifest) |
| `scopeAliases` | commit scope aliases for version bumping           |

modules are matched to conventional commit scopes — when a commit like `feat(backend): add feature` is pushed, the bump-version workflow finds the module whose name or scope alias matches `backend` and bumps its version.

### adding a new manifest adapter

to support a new manifest type (e.g. `Cargo.toml`, `build.gradle.kts`):

1. create `lib/src/manifests/adapters/<name>.ts`
2. implement the `ManifestAdapter` interface (`fileName`, `parseManifest`, `setManifestVersion`)
3. call `registerAdapter()` at module scope
4. import the adapter in `lib/src/manifests/index.ts`

## available actions

each action is a composite GitHub Action in `actions/` with its own `action.yml`.

| action                           | description                                       | key inputs                                                    |
|----------------------------------|---------------------------------------------------|---------------------------------------------------------------|
| `actions/bump-version`           | version bump with conventional commits            | `bump_type_and_channel`, `prerelease_channel`, `github_token` |
| `actions/check-publishable`      | skip publish if package.json is private           | `dir`                                                         |
| `actions/configure-git-user`     | set git user from push author or actor            | `mode`                                                        |
| `actions/create-env-file`        | write a `.env` file from key=value pairs          | `variables`, `filename`, `path`                               |
| `actions/deploy-compose-remote`  | generate docker compose deploy script for SSH     | `target_path`, `registry_username`, `registry_password`       |
| `actions/fetch-tags`             | fetch all tags + unshallow if needed              | —                                                             |
| `actions/generate-release-notes` | markdown release notes between tags               | `tag_name`, `root_dir`                                        |
| `actions/get-dockerfile-path`    | resolve dockerfile from module metadata           | `tag_name`                                                    |
| `actions/prepare-docker-meta`    | prepare docker image metadata from a git tag      | `tag_name`, `dockerfile`, `context`                           |
| `actions/resolve-deploy-config`  | resolve deploy config from `.justactions.yml`     | `environment`                                                 |
| `actions/resolve-image-tags`     | resolve docker image tags from git tags           | `repo_url`, `components`, `gh_token`                          |
| `actions/resolve-package-dir`    | resolve module directory from git tag             | `tag_name`                                                    |
| `actions/resolve-tag-meta`       | parse git tag into version metadata               | `tag`                                                         |
| `actions/scp-transfer`           | copy files to remote server via scp               | `host`, `username`, `source`, `target`                        |
| `actions/setup-ssh`              | provision ssh key + known_hosts                   | `private_key`, `host`                                         |
| `actions/skip-check`             | detect `[skip bump]` loops                        | —                                                             |
| `actions/ssh-exec`               | run a script on remote server via ssh             | `host`, `username`, `script`                                  |

use any action directly in your workflow steps:

```yaml
steps:
  - uses: justAnArthur/just-github-actions-n-workflows/actions/setup-ssh@main
    with:
      private_key: ${{ secrets.SSH_PRIVATE_KEY }}
      host: my-server.com
```

## available workflows

ready-to-copy workflow files in `workflows/`:

| workflow                         | description                                    | triggers                 |
|----------------------------------|------------------------------------------------|--------------------------|
| `bump-version.yml`               | auto-bump module versions on push              | push, dispatch, call     |
| `publish-npm-on-tag.yml`         | publish to npm + github release                | tag push, dispatch, call |
| `publish-docker-on-tag.yml`      | build + publish docker image + github release  | tag push, dispatch, call |
| `release-on-tag.yml`             | create github release with notes               | tag push, dispatch, call |
| `deploy-docker-compose.yml`      | deploy docker compose to remote server         | dispatch, call           |

## project structure

```
├── build.ts                      # validates action packages
├── package.json                  # workspace root
├── tsconfig.base.json            # shared typescript config
├── .justactions.yml              # example settings file
│
├── lib/                          # shared library (@justanarthur/actions-lib)
│   └── src/
│       ├── exec.ts               # shell execution utilities
│       ├── github.ts             # github actions runtime helpers
│       ├── index.ts              # barrel exports
│       ├── codecs/               # file format codecs (xml)
│       ├── git/                  # git utilities (tags, commits, parsing)
│       ├── ghcr/                 # container registry utilities
│       ├── manifests/            # pluggable manifest system
│       │   ├── index.ts          # types + adapter registry
│       │   ├── discovery.ts      # recursive manifest scanner
│       │   └── adapters/         # manifest format adapters
│       │       ├── npm.ts        # package.json adapter
│       │       └── maven.ts      # pom.xml adapter
│       ├── modules/              # unified module abstraction
│       │   └── index.ts          # Module type + discovery
│       ├── settings/             # project settings (.justactions.yml)
│       │   └── index.ts          # settings loader + types
│       └── version/              # semver utilities
│
├── actions/                      # composite GitHub Actions
│   ├── bump-version/             # each has action.yml + src/index.ts
│   ├── configure-git-user/
│   ├── create-env-file/
│   ├── fetch-tags/
│   ├── generate-release-notes/
│   ├── get-dockerfile-path/
│   ├── resolve-deploy-config/
│   ├── resolve-image-tags/
│   ├── resolve-package-dir/
│   ├── resolve-tag-meta/
│   ├── scp-transfer/
│   ├── setup-ssh/
│   ├── skip-check/
│   └── ssh-exec/
│
├── cli/                          # npm-published cli package
│   └── src/
│       ├── index.ts
│       └── commands/init.ts
│
├── workflows/                    # workflow templates (source of truth)
│   ├── bump-version.yml
│   ├── publish-npm-on-tag.yml
│   ├── publish-docker-on-tag.yml
│   ├── release-on-tag.yml
│   └── deploy-docker-compose.yml
│
├── .githooks/                    # git hooks (run: git config core.hooksPath .githooks)
│   └── pre-commit                # syncs workflows/ → .github/workflows/
│
└── .github/workflows/            # auto-synced by pre-commit hook
```

## how it works

1. **modules** are discovered by scanning the repo for manifest files (`package.json`,
   `pom.xml`, …). each manifest is parsed by its adapter into a unified `Module` object
   with name, version, directory, and metadata.

2. **composite actions** in `actions/` are standalone typescript programs that
   read inputs from environment variables and write outputs to `$GITHUB_OUTPUT`.
   each has an `action.yml` that sets up Bun, installs dependencies, and runs
   the action via `bun run`.

3. **workflows** in `workflows/` orchestrate multiple actions into complete
   CI/CD pipelines. each is self-contained with `push`, `workflow_dispatch`,
   and `workflow_call` triggers — copy into your repo or call as reusable.

4. **settings** (`.justactions.yml`) configure per-project deploy targets,
   module overrides, and other workflow behavior without hardcoding values.

5. **`init` cli** scaffolds the workflow files into any repo so you don't
   have to copy YAML by hand.

6. **pre-commit hook** keeps `.github/workflows/` in sync with `workflows/`
   automatically — edit the template once, the hook copies it on commit.

## secrets required

| secret            | used by                                             |
|-------------------|-----------------------------------------------------|
| `GH_TOKEN`        | all workflows (github api + push access)            |
| `NPM_TOKEN`       | publish-npm, publish-docker (npm registry)          |
| `SSH_PRIVATE_KEY`  | deploy-docker-compose (ssh authentication)         |
| `SERVER_USERNAME`  | deploy-docker-compose (ssh/scp username)           |
| `DOCKER_USERNAME`  | deploy-docker-compose (ghcr login)                 |
| `DOCKER_PASSWORD`  | deploy-docker-compose (ghcr login)                 |

## development

```bash
git config core.hooksPath .githooks   # enable git hooks (one-time setup)
bun install          # install deps
bun run build        # validate all action packages
bun test             # run tests
```
