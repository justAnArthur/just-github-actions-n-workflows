# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| v1.x    | ✅ Active          |
| < 1.0   | ❌ End of life     |

The first stable release is **v1.0.0**. Anything tagged `0.0.0-beta.*` is pre-release and not eligible for security backports.

## Reporting a Vulnerability

Please **do not file a public issue** for suspected vulnerabilities. Use one of these private channels instead:

1. **GitHub Security Advisories** — open a [private security advisory](https://github.com/justAnArthur/just-github-actions-n-workflows/security/advisories/new) on this repository. GitHub keeps the report private until a fix is published.
2. **Email** — reach out via the contact listed on the [@justAnArthur profile](https://github.com/justAnArthur).

Either channel is fine. Include:

- A clear description of the issue and the attack surface (which action, which input, which env var).
- Reproduction steps — a minimal workflow YAML, a sample manifest, or a recorded run link.
- Impact assessment (RCE, secret leak, supply-chain compromise, etc.).

## Response Targets

| Stage                | Target window   |
|----------------------|-----------------|
| Initial acknowledgement | within 72 hours |
| Triage + impact assessment | within 7 days |
| Patch for `v1.x`     | within 30 days  |
| Coordinated disclosure | after patch is published |

Critical issues (RCE in a composite action, npm/GHCR credential exposure) are fast-tracked and may receive a patch outside the normal window.

## Scope

In scope:

- All composite actions under `actions/*`.
- The shared library `lib/` (transitively affects every action).
- The CLI under `cli/`.
- The workflow templates under `workflows/`.

Out of scope (please open a regular issue instead):

- Bugs in downstream consumers' workflows that copy these templates.
- Issues in third-party actions called from this repo's workflows (e.g. `oven-sh/setup-bun`, `softprops/action-gh-release`) — file upstream.
