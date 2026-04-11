Use the **Conventional Commits** format for all commit messages. These are parsed
automatically by the `bump-version` workflow to determine version bumps.

## Format

```
<type>(<scope>[,<scope>…]): <subject>

[optional body]

[optional footer]
```

**Scope is REQUIRED.** Every commit must target a specific package scope.
Commits without a scope are ignored — no version bump will occur.
Multiple scopes can be comma-separated to bump several packages at once:
```
fix(cli,lib): shared fix across cli and lib
```

## Commit types and their version impact

| Type       | Version bump | When to use                                      |
|------------|--------------|--------------------------------------------------|
| `feat`     | **minor**    | A new feature or capability                      |
| `fix`      | patch        | A bug fix                                        |
| `perf`     | **minor**    | A performance improvement                        |
| `refactor` | patch        | Code restructuring without behavior change       |
| `chore`    | patch        | Maintenance tasks, dependency updates            |
| `docs`     | patch        | Documentation only changes                       |
| `style`    | patch        | Formatting, whitespace, semicolons               |
| `test`     | patch        | Adding or updating tests                         |
| `build`    | patch        | Build system or tooling changes                  |
| `ci`       | patch        | CI/CD pipeline changes                           |
| `revert`   | patch        | Reverting a previous commit                      |

Append `!` after the type (before the scope) for **breaking changes** → triggers a **major** bump:
```
feat!(cli): redesign authentication flow
feat!(lib): remove deprecated API
```

## Scope

**Scope is MANDATORY — commits without a scope are ignored by the version bump workflow.**
A commit without a valid scope will NOT trigger any version bump for any package.

Every commit must include a scope matching one of the values below.
This ensures only the affected package gets a version bump — never all packages at once.

⚠️ **Invalid or missing scopes = no version bump. The commit is silently skipped.**

### Available scopes

Only the following scope values are recognized. Any other value is treated as unknown and skipped:

| Scope | Package | Location |
|-------|---------|----------|
| `toolkit` or `workflows` | `@justanarthur/just-github-actions-n-workflows` | root |
| `cli` | `@justanarthur/just-github-actions-n-workflows-cli` | `cli/` |
| `lib` | `@justanarthur/just-github-actions-n-workflows-lib` | `lib/` |
| `bump-version` | `@justanarthur/step-bump-manifest-versions` | `actions/bump-version/` |
| `check-publishable` | `@justanarthur/step-check-publishable` | `actions/check-publishable/` |
| `configure-git-user` | `@justanarthur/step-configure-git-user` | `actions/configure-git-user/` |
| `create-env-file` | `@justanarthur/step-create-env-file` | `actions/create-env-file/` |
| `fetch-tags` | `@justanarthur/step-fetch-tags` | `actions/fetch-tags/` |
| `generate-release-notes` | `@justanarthur/step-generate-release-notes` | `actions/generate-release-notes/` |
| `get-dockerfile-path` | `@justanarthur/step-get-dockerfile-path` | `actions/get-dockerfile-path/` |
| `resolve-deploy-config` | `@justanarthur/step-resolve-deploy-config` | `actions/resolve-deploy-config/` |
| `resolve-image-tags` | `@justanarthur/step-resolve-image-tags` | `actions/resolve-image-tags/` |
| `resolve-package-dir` | `@justanarthur/step-resolve-package-dir` | `actions/resolve-package-dir/` |
| `resolve-tag-meta` | `@justanarthur/step-resolve-tag-meta` | `actions/resolve-tag-meta/` |
| `scp-transfer` | `@justanarthur/step-scp-transfer` | `actions/scp-transfer/` |
| `setup-ssh` | `@justanarthur/step-setup-ssh` | `actions/setup-ssh/` |
| `skip-check` | `@justanarthur/step-skip-check` | `actions/skip-check/` |
| `ssh-exec` | `@justanarthur/step-ssh-exec` | `actions/ssh-exec/` |

If a commit affects multiple packages, either use comma-separated scopes or multiple conventional commit lines.

## Comma-separated scopes

When a single change affects multiple packages equally, list scopes with commas.
Each listed scope gets the same version bump:
```
fix(cli,lib): fix shared utility used by both packages
refactor(resolve-tag-meta,check-publishable): standardize output format
```

## Multi-line commits

Multiple conventional commit lines in one message are also supported.
Use this when different packages get different change types:
```
feat(cli): add --ref flag to init command
fix(lib): handle empty tag list gracefully
```

## Examples

```
feat(cli): add interactive workflow selector to init CLI
```

```
fix(lib): handle scoped packages with special characters
```

```
feat(toolkit): add new resolve-package-dir action
```

```
chore(workflows): update workflow templates
```

```
feat!(lib): redesign manifest discovery API

The findManifests function now returns a typed result including the file path.
This is a breaking change for consumers importing from the lib.

BREAKING CHANGE: findManifests return type changed
```

```
ci(workflows): add release-on-tag workflow
```

```
feat(cli): add --force flag
fix(cli): handle existing files gracefully
```

```
fix(resolve-tag-meta): extract prerelease channel from version string
```

```
fix(cli,lib): normalize scope matching across packages
```

## Rules

- **Scope is REQUIRED** — commits without a scope are silently ignored and trigger NO version bump
- **Use ONLY scopes from the table above** — unknown scopes are skipped
- **Never omit the parentheses** — `fix: something` is wrong, `fix(lib): something` is correct
- Use lowercase for type and scope
- Use imperative mood in the subject ("add feature" not "added feature")
- Do not end the subject with a period
- Keep the subject line under 72 characters
- Separate subject from body with a blank line
- Use the body to explain *what* and *why*, not *how*
- Commits containing `[skip bump]` in the message are ignored by the version bump workflow
