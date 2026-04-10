# just-github-actions-n-workflows

release automation toolkit — version bumping, npm publishing, docker publishing, VPS deployment.  
built as **composite GitHub Actions** powered by [Bun](https://bun.sh).

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
bunx just-github-actions-n-workflows init --list
```

### what gets created

each workflow is **self-contained** — it has all triggers (`push`, `workflow_dispatch`, `workflow_call`) built in. copy
it into `.github/workflows/`, adjust the triggers for your repo, done.

```yaml
# .github/workflows/bump-version.yml (scaffolded)
name: bump-version
on:
  push:
    branches: [ main ]          # ← adjust to your default branch
  workflow_dispatch: { ... }
  workflow_call: { ... }      # also callable as a reusable workflow

jobs:
  bump-version:
    steps:
      - uses: actions/checkout@v4
      - uses: justAnArthur/just-github-actions-n-workflows/actions/fetch-tags@main
      - uses: justAnArthur/just-github-actions-n-workflows/actions/configure-git-user@main
      - uses: justAnArthur/just-github-actions-n-workflows/actions/bump-version@main
```

you can also reference workflows directly from other repos without copying:

```yaml
jobs:
  bump:
    uses: justAnArthur/just-github-actions-n-workflows/.github/workflows/bump-version.yml@main
    secrets:
      GH_TOKEN: ${{ secrets.GH_TOKEN }}
```

## available actions

each action is a composite GitHub Action in `actions/` with its own `action.yml`.

| action                           | description                               | key inputs                                                    |
|----------------------------------|-------------------------------------------|---------------------------------------------------------------|
| `actions/bump-version`           | version bump with conventional commits    | `bump_type_and_channel`, `prerelease_channel`, `github_token` |
| `actions/configure-git-user`     | set git user from push author or actor    | `mode`                                                        |
| `actions/create-env-file`        | write a `.env` file from key=value pairs  | `variables`, `filename`, `path`                               |
| `actions/fetch-tags`             | fetch all tags + unshallow if needed      | —                                                             |
| `actions/generate-release-notes` | markdown release notes between tags       | `tag_name`, `root_dir`                                        |
| `actions/get-dockerfile-path`    | resolve dockerfile from manifest metadata | `tag_name`                                                    |
| `actions/resolve-deploy-config`  | determine compose profiles and timezone   | `environment`                                                 |
| `actions/resolve-image-tags`     | resolve docker image tags from git tags   | `repo_url`, `components`, `gh_token`                          |
| `actions/scp-transfer`           | copy files to remote server via scp       | `host`, `username`, `source`, `target`                        |
| `actions/setup-ssh`              | provision ssh key + known_hosts           | `private_key`, `host`                                         |
| `actions/skip-check`             | detect `[skip bump]` loops                | —                                                             |
| `actions/ssh-exec`               | run a script on remote server via ssh     | `host`, `username`, `script`                                  |

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

| workflow                    | description                            | triggers                 |
|-----------------------------|----------------------------------------|--------------------------|
| `bump-version.yml`          | auto-bump manifest versions on push    | push, dispatch, call     |
| `publish-npm-on-tag.yml`    | publish to npm + github release        | tag push, dispatch, call |
| `release-on-tag.yml`        | create github release with notes       | tag push, dispatch, call |
| `deploy-to-vps.yml`         | deploy docker compose to VPS (example) | dispatch                 |

## project structure

```
├── build.ts                      # validates action packages
├── package.json                  # workspace root
├── tsconfig.base.json            # shared typescript config
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
│   ├── scp-transfer/
│   ├── setup-ssh/
│   ├── skip-check/
│   └── ssh-exec/
│
├── lib/                          # shared library (@justanarthur/actions-lib)
│   └── src/
│       ├── exec.ts
│       ├── github.ts
│       ├── git/                  # git utilities
│       ├── ghcr/                 # container registry utilities
│       └── version/              # semver utilities
│
├── cli/                          # npm-published cli package
│   └── src/init.ts
│
├── workflows/                    # workflow templates (source of truth)
│   ├── bump-version.yml
│   ├── publish-npm-on-tag.yml
│   ├── release-on-tag.yml
│   └── deploy-to-vps.yml
│
├── .githooks/                    # git hooks (run: git config core.hooksPath .githooks)
│   └── pre-commit                # syncs workflows/ → .github/workflows/
│
└── .github/workflows/            # auto-synced by pre-commit hook
```

## how it  

1. **composite actions** in `actions/` are standalone typescript programs that
   read inputs from environment variables and write outputs to `$GITHUB_OUTPUT`.
   each has an `action.yml` that sets up Bun, installs dependencies, and runs
   the action via `bun run`.

2. **workflows** in `workflows/` orchestrate multiple actions into complete
   CI/CD pipelines. each is self-contained with `push`, `workflow_dispatch`,
   and `workflow_call` triggers — copy into your repo or call as reusable.

3. **`init` cli** scaffolds the workflow files into any repo so you don't
   have to copy YAML by hand.

4. **pre-commit hook** keeps `.github/workflows/` in sync with `workflows/`
   automatically — edit the template once, the hook copies it on commit.

## secrets required

| secret            | used by                                    |
|-------------------|--------------------------------------------|
| `GH_TOKEN`        | all workflows (github api + push access)   |
| `NPM_TOKEN`       | publish-npm, publish-docker (npm registry) |
| `SSH_PRIVATE_KEY` | deploy-to-vps (ssh authentication)         |
| `SERVER_USERNAME` | deploy-to-vps (ssh/scp username)           |
| `DOCKER_USERNAME` | deploy-to-vps (ghcr login)                 |
| `DOCKER_PASSWORD` | deploy-to-vps (ghcr login)                 |

## development

```bash
git config core.hooksPath .githooks   # enable git hooks (one-time setup)
bun install          # install deps
bun run build        # validate all action packages
bun test             # run tests
```
