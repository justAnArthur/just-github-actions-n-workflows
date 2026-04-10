Use the **Conventional Commits** format for all commit messages. These are parsed
automatically by the `bump-version` workflow to determine version bumps.

## Format

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
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
feat!: remove legacy API endpoints
feat!(api): redesign authentication flow
```

## Scope

The scope **must** match one of:
- A package name from a `package.json` `name` field (e.g. `toolkit`, `actions`)
- A value from the `gitCommitScopeRelatedNames` property in a manifest's `properties` field

When a scope is provided, only the matching package gets a version bump.
When no scope is provided, **all** packages in the repo are bumped.

For this repository, use these scopes:
- `toolkit` / `actions` / `workflows` — for the CLI package (`@justanarthur/just-github-actions-n-workflows`)
- The action's directory name for action-specific changes (e.g. `bump-version`, `fetch-tags`, `setup-ssh`)
- `lib` — for shared library changes
- Omit scope for repo-wide changes

## Multi-item commits

Multiple conventional commit lines in one message are supported:
```
feat(toolkit): add --ref flag to init command
fix(lib): handle empty tag list gracefully
```

## Examples

```
feat(toolkit): add interactive workflow selector to init CLI
```

```
fix(bump-version): handle scoped packages with special characters
```

```
chore: update dependencies
```

```
feat!(lib): redesign manifest discovery API

The findManifests function now returns a typed result including the file path.
This is a breaking change for consumers importing from @justanarthur/actions-lib/manifests.

BREAKING CHANGE: findManifests return type changed
```

```
docs: update README with new workflow table
```

```
feat(toolkit): add --force flag
fix(toolkit): handle existing files gracefully
```

## Rules

- Use lowercase for type and scope
- Use imperative mood in the subject ("add feature" not "added feature")
- Do not end the subject with a period
- Keep the subject line under 72 characters
- Separate subject from body with a blank line
- Use the body to explain *what* and *why*, not *how*
- Commits containing `[skip bump]` in the message are ignored by the version bump workflow

