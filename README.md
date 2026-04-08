# just-github-actions-n-workflows

release automation toolkit — version bumping, docker publishing, vps deployment.  
all steps compile to **standalone linux binaries** via [bun](https://bun.sh).

## install

from any repo, run one command:

```bash
bunx just-github-actions-n-workflows init
```

this creates the workflow caller files in `.github/workflows/` automatically.
no binaries to copy — the toolkit fetches its own at runtime.

```
$ bunx just-github-actions-n-workflows init

  create  .github/workflows/bump-version.yml
  create  .github/workflows/publish-docker-on-tag.yml

done — 2 created, 0 skipped

next steps:
  1. set the GH_TOKEN secret in your repo settings
  2. commit and push: git add .github/ && git commit -m "ci: add workflows" && git push
```

you can also install a specific workflow:

```bash
bunx just-github-actions-n-workflows init bump-version
bunx just-github-actions-n-workflows init publish-docker
bunx just-github-actions-n-workflows init --list
```

### what gets created

the `init` command writes minimal caller files (~30 lines each) that reference
the reusable workflows from this repo. example:

```yaml
# .github/workflows/bump-version.yml (auto-generated)
jobs:
  bump:
    uses: justAnArthur/just-github-actions-n-workflows/.github/workflows/bump-version.yml@main
    secrets:
      GH_TOKEN: ${{ secrets.GH_TOKEN }}
```

the reusable workflow handles everything — checking out your repo, fetching
the compiled binaries, running the steps. you never touch binaries or yaml again.

### using binaries directly (custom workflows)

for project-specific workflows that don't fit a reusable template,
fetch the binaries in 3 lines:

```yaml
steps:
  - uses: actions/checkout@v4

  # fetch toolkit binaries — no need to commit dist/
  - uses: actions/checkout@v4
    with:
      repository: justAnArthur/just-github-actions-n-workflows
      path: .toolkit
      sparse-checkout: dist
  - run: cp -r .toolkit/dist ./dist && chmod +x dist/* && rm -rf .toolkit

  # now use any binary directly
  - run: ./dist/setup-ssh
  - run: ./dist/scp-transfer
  - run: ./dist/ssh-exec
```

> see `workflow.example.yaml` for complete examples.

## available binaries

| binary | description | key env vars |
|--------|-------------|-------------|
| `dist/bump-version` | version bump with conventional commits | `GITHUB_EVENT`, `BUMP_TYPE_N_STABLE_OR_CANARY`, `BUMP_MANIFEST_NAMES` |
| `dist/configure-git-user` | set git user from push author or actor | `MODE`, `GITHUB_ACTOR` |
| `dist/create-env-file` | write a `.env` file from key=value pairs | `ENV_FILE_VARIABLES`, `ENV_FILE_NAME`, `ENV_FILE_PATH` |
| `dist/fetch-tags` | fetch all tags + unshallow if needed | _(none)_ |
| `dist/generate-release-notes` | markdown release notes between tags | `TAG_NAME`, `ROOT_DIR` |
| `dist/get-dockerfile-path` | resolve dockerfile from manifest metadata | `TAG_NAME` |
| `dist/scp-transfer` | copy files to remote server via scp | `SCP_HOST`, `SCP_USERNAME`, `SCP_SOURCE`, `SCP_TARGET` |
| `dist/setup-ssh` | provision ssh key + known_hosts | `SSH_PRIVATE_KEY`, `SSH_HOST` |
| `dist/skip-check` | detect `[skip bump]` loops (defence-in-depth) | _(none)_ |
| `dist/ssh-exec` | run a script on a remote server via ssh | `SSH_EXEC_HOST`, `SSH_EXEC_USERNAME`, `SSH_EXEC_SCRIPT` |

## project structure

```
├── build.ts                      # compiles steps/ → dist/ binaries
├── init.ts                       # cli: `bunx ... init` scaffolding
├── package.json
├── workflow.example.yaml         # annotated reference
│
├── .github/workflows/            # reusable workflows (workflow_call)
│   ├── bump-version.yml
│   └── publish-docker-on-tag.yml
│
├── steps/                        # step entry points (one binary each)
│   ├── bump-version.ts
│   ├── configure-git-user.ts
│   ├── create-env-file.ts
│   ├── fetch-tags.ts
│   ├── generate-release-notes.ts
│   ├── get-dockerfile-path.ts
│   ├── scp-transfer.ts
│   ├── setup-ssh.ts
│   ├── skip-check.ts
│   ├── ssh-exec.ts
│   └── _lib/                     # shared library (bundled into each binary)
│       ├── exec.ts
│       ├── github.ts
│       ├── codecs/xml.ts
│       ├── ghcr/
│       ├── git/
│       ├── manifests/
│       └── version/
│
├── workflows/                    # caller examples you can copy
│   ├── bump-version.yml
│   ├── publish-docker-on-tag.yml
│   └── deploy-to-vps.yml
│
└── dist/                         # compiled linux-x64 binaries (committed)
```

## how it works

1. **step scripts** in `steps/` are standalone typescript programs that read
   configuration from environment variables and write outputs to `$GITHUB_OUTPUT`.

2. **`bun run build`** compiles each step into a single self-contained linux binary
   using `bun build --compile --target=bun-linux-x64`. no node, bun, or npm needed
   on the runner at execution time.

3. **reusable workflows** in `.github/workflows/` are `workflow_call` workflows.
   they checkout the caller's repo, fetch the toolkit's `dist/` binaries, and
   run the steps. other repos call them with a single `uses:` line.

4. **`init` cli** creates the minimal caller files in any repo so you never
   write yaml by hand.

## secrets required

| secret | used by |
|--------|---------|
| `GH_TOKEN` | all workflows (github api + push access) |
| `SSH_PRIVATE_KEY` | deploy-to-vps (ssh authentication) |
| `SERVER_USERNAME` | deploy-to-vps (ssh/scp username) |
| `DOCKER_USERNAME` | deploy-to-vps (ghcr login) |
| `DOCKER_PASSWORD` | deploy-to-vps (ghcr login) |
| `NPM_TOKEN` | publish-docker-on-tag (npm registry in docker build) |

## development

```bash
bun install          # install deps
bun run build        # compile steps/ → dist/ binaries
bun test             # run tests
```

after editing `steps/`, rebuild and commit:

```bash
bun run build
git add dist/
git commit -m "chore: rebuild step binaries"
```

to publish the cli to npm:

```bash
npm publish
```
