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
- A package name from a `package.json` `name` field
- A value from the `gitCommitScopeRelatedNames` property in a manifest's `properties` field

When a scope is provided, only the matching package gets a version bump.
When no scope is provided, **all** packages in the repo are bumped.

This monorepo has the following versioned packages:

| Scope | Package | Location | Published |
|-------|---------|----------|-----------|
| `toolkit` / `workflows` | `@justanarthur/just-github-actions-n-workflows` | root | private |
| `cli` | `@justanarthur/just-github-actions-n-workflows-cli` | `cli/` | npm |
| `lib` | `@justanarthur/just-github-actions-n-workflows-lib` | `lib/` | private |
| _(omit scope)_ | all of the above | | |

Each action in `actions/` also has its own `package.json` (e.g. `@justanarthur/step-bump-manifest-versions`)
but they are private workspace packages without scope aliases — they get bumped when no scope is specified.

## Multi-item commits

Multiple conventional commit lines in one message are supported:
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
chore: update dependencies
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

## Rules

- Use lowercase for type and scope
- Use imperative mood in the subject ("add feature" not "added feature")
- Do not end the subject with a period
- Keep the subject line under 72 characters
- Separate subject from body with a blank line
- Use the body to explain *what* and *why*, not *how*
- Commits containing `[skip bump]` in the message are ignored by the version bump workflow

