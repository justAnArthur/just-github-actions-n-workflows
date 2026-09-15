# just-github-actions-n-workflows

> **v1.0.0 — first stable release.** tags use the `@scope/name@1.0.0` per-package format. pin a specific major by referencing `@v1` after release; see *Repo-level tag* below.

generic, versioned CI/CD workflow toolkit — version bumping, npm publishing, docker publishing, vercel deployment, docker compose deployment.  
built as **composite GitHub Actions** powered by [Bun](https://bun.sh).

> **v1 limitation.** the CLI (`@justanarthur/just-github-actions-n-workflows-cli`) depends on the private library `@justanarthur/just-github-actions-n-workflows-lib`. as a result, `npm install -g @justanarthur/just-github-actions-n-workflows-cli@1.0.0` is **not yet resolvable from the registry** — `bun publish` substitutes the workspace dep from the lockfile, but lib itself is unpublished. the CLI ships on npm for tagging purposes and is fully usable from source via `bun run cli/`. resolving this is tracked for v1.x.

## use this in your repo

pick the path that matches how much you want to take:

### path A — copy workflow files (works today, no CLI)

the most reliable option right now. each workflow file in `workflows/` is self-contained: it has `push` / `workflow_dispatch` / `workflow_call` triggers and a header comment explaining how to use it.

1. **copy the files you want** into `.github/workflows/` of your repo:

   ```bash
   mkdir -p .github/workflows
   curl -fsSL https://raw.githubusercontent.com/justAnArthur/just-github-actions-n-workflows/v1.0.0/workflows/bump-version.yml       > .github/workflows/bump-version.yml
   curl -fsSL https://raw.githubusercontent.com/justAnArthur/just-github-actions-n-workflows/v1.0.0/workflows/publish-npm-on-tag.yml > .github/workflows/publish-npm-on-tag.yml
   # add any other workflows from https://github.com/justAnArthur/just-github-actions-n-workflows/tree/main/workflows
   ```

2. **add the required secrets** under your repo → Settings → Secrets → Actions. the workflows read these as `${{ secrets.<NAME> }}`. all workflows use the auto-provided `GITHUB_TOKEN` for github api calls — no PAT required unless you have a specific reason to set one.

   | workflow                          | secrets (in addition to auto `GITHUB_TOKEN`)               |
   |-----------------------------------|-------------------------------------------------------------|
   | `bump-version.yml`                | (none)                                                      |
   | `publish-npm-on-tag.yml`          | `NPM_TOKEN`                                                 |
   | `publish-docker-on-tag.yml`       | (optional `NPM_TOKEN` build-arg)                            |
   | `deploy-vercel-on-tag.yml`        | `VERCEL_DEPLOY_HOOK_URL`                                    |
   | `release-on-tag.yml`              | (none)                                                      |
   | `deploy-docker-compose.yml`       | `SSH_PRIVATE_KEY`, `SERVER_USERNAME`, `DOCKER_USERNAME`, `DOCKER_PASSWORD` |

3. **configure each package's manifest** with a `properties` block so the bump-version workflow knows which package to bump on which commit scope. see [manifest configuration](#manifest-configuration) for the schema.

4. **commit and push**:

   ```bash
   git add .github/ && git commit -m "ci: add release workflows" && git push
   ```

5. **release your first version**:

   ```bash
   # push a tag manually the first time. after this, every push to main
   # will auto-bump the matching package based on conventional commits.
   git tag @scope/my-package@1.0.0    # adjust scope + name + version
   git push origin @scope/my-package@1.0.0
   ```

### path B — reference actions directly (modular)

if you only want a couple of pieces (e.g. just `setup-ssh` + `scp-transfer`), reference individual actions in your own workflows:

```yaml
# .github/workflows/deploy.yml
name: deploy

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: justAnArthur/just-github-actions-n-workflows/actions/setup-ssh@main
        with:
          private_key: ${{ secrets.SSH_PRIVATE_KEY }}
          host: my-server.com

      - uses: justAnArthur/just-github-actions-n-workflows/actions/ssh-exec@main
        with:
          host: my-server.com
          username: ${{ secrets.SERVER_USERNAME }}
          script: |
            cd ~/my-app
            docker compose pull
            docker compose up -d
```

pin to `@v1` for major-version stability once we cut a `v1.0.0` repo-level tag (currently we ship per-package tags — see [available actions](#available-actions) for the full list).

### path C — CLI install (best UX, broken for npm install in v1)

the CLI scaffolds workflows into your repo, tracks installed versions in a lock file, and lets you update with one command. it is the best long-term path but **is not currently usable via npm install** — see the v1 limitation callout at the top. workarounds:

- **run from a local clone of this repo**:

  ```bash
  git clone https://github.com/justAnArthur/just-github-actions-n-workflows.git
  cd just-github-actions-n-workflows
  bun install
  bun run cli/ <command>             # see "cli" section below
  ```

- **wait for v1.x**: making the lib package publishable is tracked. once shipped, `npm install -g @justanarthur/just-github-actions-n-workflows-cli` will work as documented below.

## end-to-end example: ship a 3-package monorepo to npm + docker

concrete walkthrough of what a release cycle looks like with this toolkit installed.

**repo shape** (the `packages/api`, `packages/web`, `packages/shared` layout):

```
my-monorepo/
├── package.json                     # workspace root, name: "my-monorepo"
├── packages/
│   ├── shared/
│   │   ├── package.json             # name: "@myorg/shared"
│   │   └── src/index.ts
│   ├── api/
│   │   ├── package.json             # name: "@myorg/api", properties.dockerfilePath
│   │   ├── Dockerfile
│   │   └── src/server.ts
│   └── web/
│       ├── package.json             # name: "@myorg/web"
│       └── src/app.tsx
└── .github/workflows/
    ├── bump-version.yml             # copied from this repo
    └── publish-npm-on-tag.yml       # copied from this repo
```

**step 1 — declare what each package bumps on**. open each `package.json`, add the `properties` block:

```jsonc
// packages/shared/package.json
{
  "name": "@myorg/shared",
  "version": "0.1.0",
  "properties": {
    "gitCommitScopeRelatedNames": "shared,lib"
  }
}
```

```jsonc
// packages/api/package.json
{
  "name": "@myorg/api",
  "version": "0.1.0",
  "properties": {
    "gitCommitScopeRelatedNames": "api,backend",
    "dockerfilePath": "./Dockerfile"     // enables "docker" deploy target
  }
}
```

```jsonc
// packages/web/package.json
{
  "name": "@myorg/web",
  "version": "0.1.0",
  "properties": {
    "gitCommitScopeRelatedNames": "web,frontend"
  }
}
```

**step 2 — set secrets** in your GitHub repo: `GH_TOKEN`, `NPM_TOKEN`.

**step 3 — write code with conventional commits**. the commit scope determines which package gets bumped:

```bash
git commit -m "feat(api): add /healthz endpoint"      # bumps @myorg/api only
git commit -m "fix(shared): correct date formatting"  # bumps @myorg/shared only
git commit -m "feat(frontend): redesign dashboard"    # bumps @myorg/web only
git push                                              # bump-version.yml auto-bumps on push to main
```

**step 4 — release**. the bump-version workflow pushes annotated tags like `@myorg/api@0.2.0` with a JSON annotation listing the deploy targets. the publish-npm workflow picks each tag up and:
- for `npm`-tagged packages → publishes to npm at the new version
- for non-npm-tagged packages (private, lib, etc.) → skips
- creates a GitHub release with conventional-commit-derived notes

if you also want docker images built and pushed to ghcr.io, copy `publish-docker-on-tag.yml` as well.

**step 5 — keep things updated**. when a new toolkit release lands, either re-run `init` (when CLI install is fixed) or re-curl the workflow files:

```bash
curl -fsSL https://raw.githubusercontent.com/justAnArthur/just-github-actions-n-workflows/v1.2.0/workflows/bump-version.yml > .github/workflows/bump-version.yml
git diff .github/workflows/bump-version.yml           # review what changed
git add . && git commit -m "ci: bump toolkit to v1.2.0" && git push
```

## overview

this is a repo of **generic, installable/updatable workflows** for project release automation.
each workflow works with project **modules** — independent packages within a monorepo (or single-repo), each with its own **manifest** (`package.json`, `pom.xml`, etc.) that is parsed into a unified `Module` object used across all workflows.

### core concepts

- **module** — a project component with its own manifest, version, and optional Dockerfile
- **manifest** — a file (`package.json`, `pom.xml`, …) that declares the module's name, version, and metadata
- **adapter** — a pluggable parser for each manifest type (npm, maven, … more to come)
- **deploy targets** — deployment types inferred from the manifest (`npm`, `docker`, `vercel`) and embedded in git tag annotations
- **settings file** (`.justactions.yml`) — per-project config for deploy targets, module overrides, etc.

## cli

the CLI is `cli/` in this repo. it ships on npm at `@justanarthur/just-github-actions-n-workflows-cli` (see the v1 limitation callout at the top for why `npm install` doesn't yet work).

### install (from source, current workaround)

```bash
git clone https://github.com/justAnArthur/just-github-actions-n-workflows.git
cd just-github-actions-n-workflows
bun install
bun run cli/ <command>
```

### install (when v1.x ships the lib fix)

```bash
npm install -g @justanarthur/just-github-actions-n-workflows-cli
# or
npx @justanarthur/just-github-actions-n-workflows-cli <command>
```

### commands

#### `init` — scaffold workflows

```bash
# interactive — pick version, select workflows
just-github-actions-n-workflows init

# install specific workflows by name
just-github-actions-n-workflows init bump-version publish-npm-on-tag

# install all workflows non-interactively
just-github-actions-n-workflows init --yes

# pin to a specific version
just-github-actions-n-workflows init --ref v1.0.0

# overwrite existing workflow files
just-github-actions-n-workflows init --force

# skip creating .justactions.yml
just-github-actions-n-workflows init --no-settings

# skip scaffolding .github/AGENTS.md and the root symlink
just-github-actions-n-workflows init --no-agents

# list available workflows without installing
just-github-actions-n-workflows init --list
```

`init` and `update` also write `.github/AGENTS.md` (with a symlink at the repo root as `AGENTS.md`) so an AI coding agent landing in this repo gets a guide to the release machinery: conventional-commit scope mapping, the `@scope/name@version` tag annotation JSON contract, why a publish might skip, and the secrets it shouldn't touch. this file is owned by the toolkit — `update` rewrites it on every upgrade. to customize agent-facing instructions for your specific repo, write a separate `CONTRIBUTING.md` instead.

| flag             | short | description                                      |
|------------------|-------|--------------------------------------------------|
| `--list`         | `-l`  | show available workflows without installing      |
| `--force`        | `-f`  | overwrite existing workflow files                |
| `--yes`          | `-y`  | skip interactive prompts, install all workflows  |
| `--ref <ref>`    |       | git ref to fetch from (tag, branch, sha)         |
| `--no-settings`  |       | skip creating the `.justactions.yml` file        |
| `--no-agents`    |       | skip scaffolding `.github/AGENTS.md` and the root symlink |

the `init` command:
1. fetches available versions (sorted by semver, latest first)
2. lets you pick which workflows to install
3. writes the workflow files to `.github/workflows/`
4. scaffolds a `.justactions.yml` settings template
5. writes a `.toolkit-lock.json` lock file tracking installed versions

```
$ just-github-actions-n-workflows init

  just-github-actions-n-workflows
  release automation toolkit

  step 1 — select version

? Pick a version
❯ 1.0.0 (latest stable)
  0.0.0-beta.11
  0.0.0-beta.8

  step 2 — select workflows

? Select workflows to install
  bump-version               auto-bump module versions on push
  publish-npm-on-tag         publish to npm + github release
  publish-docker-on-tag      build + publish docker image
  deploy-vercel-on-tag       deploy to vercel on tag push
  release-on-tag             create github release with notes
  deploy-docker-compose      deploy docker compose to remote server

  step 3 — install

  create  .github/workflows/bump-version.yml
  create  .github/workflows/publish-npm-on-tag.yml
  create  .justactions.yml

  lock file written → .github/workflows/.toolkit-lock.json

done — 2 created, 0 skipped

  required secrets:

  • GH_TOKEN           github token with contents:write
  • NPM_TOKEN          npm registry publish token

  set these in your repo → Settings → Secrets → Actions

  next steps:

  1. set the secrets listed above
  2. adjust push.branches / push.tags triggers for your repo
  3. configure .justactions.yml with your deploy targets (if using deploy workflow)
  4. commit and push:
     git add .github/ .justactions.yml && git commit -m "ci: add workflows" && git push
```

#### `update` — update installed workflows

```bash
# update all workflows to the latest version
just-github-actions-n-workflows update

# update to a specific version
just-github-actions-n-workflows update --ref v2.0.0

# skip confirmation prompt
just-github-actions-n-workflows update --yes
```

reads `.toolkit-lock.json` to find installed workflows, compares versions, and re-fetches outdated ones. also re-writes `.github/AGENTS.md` so doc improvements ship to existing users. **must be run from the repo root** (same constraint as `status`).

#### `status` — check installed workflow versions

```bash
# show status of installed workflows
just-github-actions-n-workflows status

# compare against a specific ref
just-github-actions-n-workflows status --ref v2.0.0
```

shows which workflows are up to date and which can be updated. **must be run from the repo root** — `status`, `update`, and `init` resolve `.github/workflows/.toolkit-lock.json` and `.github/AGENTS.md` relative to `process.cwd()`.

## settings file

create a `.justactions.yml` in your repo root to configure deploy targets and module overrides. the `init` command scaffolds this file automatically. only needed if you use one of the deploy workflows (`deploy-docker-compose.yml`, `deploy-vercel-on-tag.yml`).

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

### settings reference

| path                                  | type     | description                                             |
|---------------------------------------|----------|---------------------------------------------------------|
| `deploy.ssh_target_path`              | string   | remote path for deployment files                        |
| `deploy.targets.<name>.host`          | string   | ssh hostname for the environment                        |
| `deploy.targets.<name>.compose_profiles` | string | comma-separated module names to deploy                 |
| `deploy.targets.<name>.profiles`      | string   | docker compose profile names                            |
| `deploy.targets.<name>.timezone`      | string   | timezone for the environment (default: `UTC`)           |
| `modules.overrides[].name`            | string   | module name to override                                 |
| `modules.overrides[].docker_compose_service` | string | docker compose service name for the module         |

## manifest configuration

modules are discovered by scanning the repo for manifest files (`package.json`, `pom.xml`). each manifest declares metadata in a `properties` section that controls versioning and deployment.

### package.json

```jsonc
{
  "name": "@scope/my-package",
  "version": "1.0.0",
  "private": false,
  "properties": {
    // commit scopes that map to this package (comma-separated)
    // e.g. "feat(backend): ..." will bump this package's version
    "gitCommitScopeRelatedNames": "backend,api",

    // path to Dockerfile (relative to package.json directory)
    // enables "docker" deploy target
    "dockerfilePath": "./Dockerfile",

    // vercel project ID — enables "vercel" deploy target
    "vercelProjectId": "prj_xxxxxxxxxxxxx",

    // build priority (lower = build first, for monorepo ordering)
    "priority": 1,

    // explicit deploy targets override (comma-separated)
    // overrides auto-detection if set
    "deployTargets": "npm,docker,vercel"
  }
}
```

### pom.xml

```xml
<project>
  <name>my-service</name>
  <version>1.0.0</version>
  <properties>
    <!-- commit scopes that map to this module -->
    <gitCommitScopeRelatedNames>backend,api</gitCommitScopeRelatedNames>

    <!-- path to Dockerfile — enables "docker" deploy target -->
    <DockerfilePath>./Dockerfile</DockerfilePath>

    <!-- vercel project ID — enables "vercel" deploy target -->
    <vercelProjectId>prj_xxxxxxxxxxxxx</vercelProjectId>

    <!-- build priority -->
    <priority>1</priority>

    <!-- explicit deploy targets override -->
    <deployTargets>docker</deployTargets>
  </properties>
</project>
```

### deploy targets

deploy targets are **inferred automatically** from manifest properties and embedded into git tag annotations when versions are bumped. downstream workflows read the annotation and skip jobs that don't apply.

| target   | auto-detected when                                | workflow                      |
|----------|---------------------------------------------------|-------------------------------|
| `npm`    | `private` is not `true` (package.json only)       | `publish-npm-on-tag.yml`      |
| `docker` | `dockerfilePath` is set                           | `publish-docker-on-tag.yml`   |
| `vercel` | `vercelProjectId` is set                          | `deploy-vercel-on-tag.yml`    |

to **override** auto-detection, set `properties.deployTargets` explicitly:

```jsonc
// only publish to npm, skip docker even though dockerfilePath is set
{ "properties": { "deployTargets": "npm" } }
```

```jsonc
// deploy to both docker and vercel
{ "properties": { "deployTargets": "docker,vercel" } }
```

### how deploy targets flow

1. **manifest parse** → adapter reads `package.json` / `pom.xml` and infers `deployTargets`
2. **version bump** → `bump-version` action creates an annotated git tag with `{"deployTargets":["npm","docker"]}` in the tag message
3. **tag push** → publish/deploy workflows trigger, `resolve-tag-meta` reads the tag annotation
4. **skip check** → each workflow checks its target (e.g. `publish_npm == 'true'`) and skips early if not present

for legacy tags without annotations, workflows fall back to runtime detection (e.g. `check-publishable` for npm, `get-dockerfile-path` for docker).

### how modules work

each module is discovered by scanning the repo for manifest files. the unified `Module` type includes:

| field            | description                                        |
|------------------|----------------------------------------------------|
| `name`           | module name from the manifest                      |
| `version`        | current version string                             |
| `dir`            | resolved directory containing the manifest         |
| `manifestType`   | which adapter parsed it (`npm`, `maven`, …)        |
| `dockerfilePath`  | path to the Dockerfile (if declared in manifest)  |
| `deployTargets`  | inferred deployment targets (`npm`, `docker`, `vercel`) |
| `scopeAliases`   | commit scope aliases for version bumping           |

modules are matched to conventional commit scopes — when a commit like `feat(backend): add feature` is pushed, the bump-version workflow finds the module whose name or scope alias matches `backend` and bumps its version.

### adding a new manifest adapter

to support a new manifest type (e.g. `Cargo.toml`, `build.gradle.kts`):

1. create `lib/src/manifests/adapters/<name>.ts`
2. implement the `ManifestAdapter` interface (`fileName`, `parseManifest`, `setManifestVersion`)
3. call `registerAdapter()` at module scope
4. import the adapter in `lib/src/manifests/index.ts`

the `parseManifest` function must return a `Manifest` object with `deployTargets` populated — infer them from manifest content or support an explicit override property.

## available actions

each action is a composite GitHub Action in `actions/` with its own `action.yml`. use any action directly in your workflow steps (path B above).

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
| `actions/pin-workspace-versions` | rewrite `workspace:` deps to sibling versions     | `dir`                                                         |
| `actions/prepare-docker-meta`    | prepare docker image metadata from a git tag      | `tag_name`, `dockerfile`, `context`                           |
| `actions/resolve-deploy-config`  | resolve deploy config from `.justactions.yml`     | `environment`                                                 |
| `actions/resolve-image-tags`     | resolve docker image tags from git tags           | `repo_url`, `components`, `gh_token`                          |
| `actions/resolve-package-dir`    | resolve module directory from git tag             | `tag_name`                                                    |
| `actions/resolve-tag-meta`       | parse git tag into version + deploy metadata      | `tag`                                                         |
| `actions/scp-transfer`           | copy files to remote server via scp               | `host`, `username`, `source`, `target`                        |
| `actions/setup-ssh`              | provision ssh key + known_hosts                   | `private_key`, `host`                                         |
| `actions/skip-check`             | detect `[skip bump]` loops                        | —                                                             |
| `actions/ssh-exec`               | run a script on remote server via ssh             | `host`, `username`, `script`                                  |
| `actions/trigger-deploy-hook`    | HTTP POST to a deploy hook URL (e.g. vercel)      | `hook_url`, `tag`                                             |

use any action directly in your workflow steps:

```yaml
steps:
  - uses: justAnArthur/just-github-actions-n-workflows/actions/setup-ssh@main
    with:
      private_key: ${{ secrets.SSH_PRIVATE_KEY }}
      host: my-server.com
```

### resolve-tag-meta outputs

the `resolve-tag-meta` action is used by all publish/deploy workflows. it parses the git tag and reads the tag annotation:

| output               | description                                                |
|----------------------|------------------------------------------------------------|
| `tag`                | cleaned tag name                                           |
| `pkg_name`           | package name from the tag                                  |
| `version`            | version from the tag                                       |
| `npm_tag`            | npm dist-tag (`latest`, `canary`, `beta`, …)               |
| `is_prerelease`      | `true` if version has a prerelease identifier              |
| `prerelease_channel` | channel name (`canary`, `beta`, …) or empty                |
| `deploy_targets`     | JSON array of deploy targets (e.g. `["npm","docker"]`)     |
| `publish_npm`        | `true` if tag has `npm` deploy target                      |
| `publish_docker`     | `true` if tag has `docker` deploy target                   |
| `publish_vercel`     | `true` if tag has `vercel` deploy target                   |
| `has_annotation`     | `true` if the tag has a valid annotation                   |

## available workflows

ready-to-copy workflow files in `workflows/`:

| workflow                         | description                                    | triggers                 |
|----------------------------------|------------------------------------------------|--------------------------|
| `bump-version.yml`               | auto-bump module versions on push              | push, dispatch, call     |
| `publish-npm-on-tag.yml`         | publish to npm + github release                | tag push, dispatch, call |
| `publish-docker-on-tag.yml`      | build + publish docker image + github release  | tag push, dispatch, call |
| `deploy-vercel-on-tag.yml`       | deploy to vercel (production or preview)       | tag push, dispatch, call |
| `release-on-tag.yml`             | create github release with notes               | tag push, dispatch, call |
| `deploy-docker-compose.yml`      | deploy docker compose to remote server         | dispatch, call           |

## how it works

1. **modules** are discovered by scanning the repo for manifest files (`package.json`,
   `pom.xml`, …). each manifest is parsed by its adapter into a unified `Module` object
   with name, version, directory, deploy targets, and metadata.

2. **deploy targets** (`npm`, `docker`, `vercel`) are inferred from manifest properties
   and embedded in annotated git tags as JSON. this lets downstream workflows skip
   irrelevant jobs immediately via `if:` conditions — no runtime detection needed.

3. **composite actions** in `actions/` are standalone typescript programs that
   read inputs from environment variables and write outputs to `$GITHUB_OUTPUT`.
   each has an `action.yml` that sets up Bun, installs dependencies, and runs
   the action via `bun run`.

4. **workflows** in `workflows/` orchestrate multiple actions into complete
   CI/CD pipelines. each is self-contained with `push`, `workflow_dispatch`,
   and `workflow_call` triggers — copy into your repo or call as reusable.

5. **settings** (`.justactions.yml`) configure per-project deploy targets,
   module overrides, and other workflow behavior without hardcoding values.

6. **`init` cli** scaffolds the workflow files into any repo so you don't
   have to copy YAML by hand. tracks installed versions in a lock file.

7. **pre-commit hook** keeps `.github/workflows/` in sync with `workflows/`
   automatically — edit the template once, the hook copies it on commit.

## secrets required

| secret                | used by                                                              |
|-----------------------|----------------------------------------------------------------------|
| `NPM_TOKEN`           | `publish-npm-on-tag.yml`; optional build-arg in `publish-docker-on-tag.yml` |
| `VERCEL_DEPLOY_HOOK_URL` | `deploy-vercel-on-tag.yml`                                        |
| `SSH_PRIVATE_KEY`     | `deploy-docker-compose.yml` (ssh authentication)                     |
| `SERVER_USERNAME`     | `deploy-docker-compose.yml` (ssh/scp username)                       |
| `DOCKER_USERNAME`     | `deploy-docker-compose.yml` (ghcr login)                             |
| `DOCKER_PASSWORD`     | `deploy-docker-compose.yml` (ghcr login)                             |

all workflows use the auto-provided `GITHUB_TOKEN` — no PAT required. set `GH_TOKEN` and forward it via `workflow_call` only if a specific step needs a PAT with elevated scopes.

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
│       │   └── tag-n-push.ts     # annotated tag creation + reading
│       ├── ghcr/                 # container registry utilities
│       ├── manifests/            # pluggable manifest system
│       │   ├── registry.ts       # Manifest + DeployTarget types + adapter registry
│       │   ├── index.ts          # re-exports + adapter auto-registration
│       │   ├── discovery.ts      # recursive manifest scanner
│       │   └── adapters/         # manifest format adapters
│       │       ├── npm.ts        # package.json adapter
│       │       └── maven.ts      # pom.xml adapter
│       ├── modules/              # unified module abstraction
│       │   └── index.ts          # Module type + discovery
│       ├── settings/             # project settings (.justactions.yml)
│       │   └── index.ts          # settings loader + types
│       └── version/              # semver utilities
│           ├── parse-semver.ts   # semver parser + formatter
│           ├── compare-semver.ts # semver comparison
│           └── calculate-semver.ts # next version calculator
│
├── actions/                      # composite GitHub Actions
│   ├── bump-version/             # each has action.yml + src/index.ts
│   ├── check-publishable/
│   ├── configure-git-user/
│   ├── create-env-file/
│   ├── deploy-compose-remote/
│   ├── fetch-tags/
│   ├── generate-release-notes/
│   ├── get-dockerfile-path/
│   ├── pin-workspace-versions/
│   ├── prepare-docker-meta/
│   ├── resolve-deploy-config/
│   ├── resolve-image-tags/
│   ├── resolve-package-dir/
│   ├── resolve-tag-meta/
│   ├── scp-transfer/
│   ├── setup-ssh/
│   ├── skip-check/
│   ├── ssh-exec/
│   └── trigger-deploy-hook/
│
├── cli/                          # npm-published cli package
│   └── src/
│       ├── github.ts             # github api + semver-sorted tag fetching
│       ├── lockfile.ts           # .toolkit-lock.json management
│       └── commands/
│           ├── init.ts           # scaffold workflows + settings
│           ├── update.ts         # update installed workflows
│           └── status.ts         # show installed workflow versions
│
├── workflows/                    # workflow templates (source of truth)
│   ├── bump-version.yml
│   ├── publish-npm-on-tag.yml
│   ├── publish-docker-on-tag.yml
│   ├── deploy-vercel-on-tag.yml
│   ├── release-on-tag.yml
│   └── deploy-docker-compose.yml
│
├── .githooks/                    # git hooks (run: git config core.hooksPath .githooks)
│   └── pre-commit                # syncs workflows/ → .github/workflows/
│
└── .github/workflows/            # auto-synced by pre-commit hook
```

## development

```bash
git config core.hooksPath .githooks   # enable git hooks (one-time setup)
bun install          # install deps
bun run build        # validate all action packages
bun test             # run tests
```

## license

[MIT](LICENSE).
