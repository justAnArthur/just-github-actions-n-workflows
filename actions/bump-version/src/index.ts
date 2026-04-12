// bump-version step
// ---
// automated version bumping for mono-repo manifests.
// see package @justanarthur/actions-lib for shared utilities.
// ---

import { parseCommitMessage, type ParsedCommit } from "@justanarthur/just-github-actions-n-workflows-lib/git/conventional-commit-parser"
import { calculateNextSemver, CONVENTIONAL_TO_SEMVER, SEMVER } from "@justanarthur/just-github-actions-n-workflows-lib/version/calculate-semver"
import type { Manifest } from "@justanarthur/just-github-actions-n-workflows-lib/manifests"
import { findManifestByName, findManifests, getManifestSearchDir, updateManifest } from "@justanarthur/just-github-actions-n-workflows-lib/manifests"
import { commitAndPush } from "@justanarthur/just-github-actions-n-workflows-lib/git/commit-n-push"
import { tagAndPush, type TagAnnotation } from "@justanarthur/just-github-actions-n-workflows-lib/git/tag-n-push"
import { getCommitsFromTheLastStable } from "@justanarthur/just-github-actions-n-workflows-lib/git/get-commits-from-the-last-stable"
import { deletePrereleaseImages, manifestNameToImageName } from "@justanarthur/just-github-actions-n-workflows-lib/ghcr/delete-canary-images"
import { log } from "@justanarthur/just-github-actions-n-workflows-lib/github"
import { GITHUB_ACTIONS_BOT, withCoAuthors } from "@justanarthur/just-github-actions-n-workflows-lib/git/co-authors"

// --- discover manifests ---

log.group("bump-manifest-versions")
log.info("starting version bump process...")

const dir = getManifestSearchDir()
log.info(`manifest search directory: ${dir}`)

const manifests = await findManifests(dir)
log.info(`discovered manifests: ${manifests.map((m) => m.name)}`)

// --- read env configuration ---

const bumpToCalculatedStableEnv =
  process.env.BUMP_TO_CALCULATED_STABLE_VERSION?.toLowerCase() === "true"

const [bumpTypeEnv, bumpStableOrCanary] = process.env.BUMP_TYPE_N_STABLE_OR_CANARY
  ? process.env.BUMP_TYPE_N_STABLE_OR_CANARY.split(":").map((s) => s.trim())
  : [null, null]

const handleBumpManifestNamesEnv = process.env.BUMP_MANIFEST_NAMES
  ? process.env.BUMP_MANIFEST_NAMES.split(",").map((s) => s.trim()).filter(Boolean)
  : null

log.debug(`bump-to-stable: ${bumpToCalculatedStableEnv}`)
log.debug(`bump-type: ${bumpTypeEnv}, channel: ${bumpStableOrCanary}`)
log.debug(`manifest filter: ${handleBumpManifestNamesEnv}`)

// prerelease channel label — defaults to "canary", can be "beta", "alpha", "rc", …
const prereleaseChannel = process.env.BUMP_PRERELEASE_CHANNEL?.trim() || "canary"
log.debug(`prerelease channel: ${prereleaseChannel}`)

// only bump the manifests the user asked for, or all of them
const bumpManifests =
  handleBumpManifestNamesEnv && handleBumpManifestNamesEnv.length > 0
    ? handleBumpManifestNamesEnv.map((name) => {
      const manifest = findManifestByName(manifests, name)
      if (!manifest) {
        log.error(`manifest with name "${name}" not found among discovered manifests`)
        throw new Error(`manifest with name "${name}" not found`)
      }
      return manifest
    })
    : manifests

const manifestNextVersions: [Manifest, string][] = []

// --- strategy 1: stable from history ---

if (bumpToCalculatedStableEnv) {
  log.group("bumping to calculated stable versions...")

  for (const manifest of bumpManifests) {
    try {
      const commits = await getCommitsFromTheLastStable(manifest)
      log.info(`${manifest.name}: ${commits.length} commit(s) since last stable`)

      const parsedCommits = commits.map(parseCommitMessage)
      const scopedItems = parsedCommits
        .flatMap((c) => c.items)
        .filter((i) =>
          i.scopes.length > 0 &&
          i.scopes.some((s) => findManifestByName([manifest], s))
        )

      let semver = -1
      for (const item of scopedItems) {
        const level = CONVENTIONAL_TO_SEMVER[item.type]
        if (level !== undefined && level > semver) semver = level
      }

      if (semver === -1) {
        log.info(`${manifest.name}: no version bump needed`)
        continue
      }

      const nextVersion = calculateNextSemver(manifest.version, semver, "stable")
      log.info(`${manifest.name}: ${manifest.version} → ${nextVersion}`)
      manifestNextVersions.push([manifest, nextVersion])
    } catch (err) {
      log.error(`error calculating stable version: ${err}`)
      process.exit(1)
    }
  }

  log.groupEnd()

// --- strategy 2: manual dispatch ---

} else if ((bumpTypeEnv || bumpStableOrCanary) && handleBumpManifestNamesEnv) {
  log.group("bumping based on manual dispatch inputs...")

  for (const manifest of bumpManifests) {
    const nextVersion = calculateNextSemver(
      manifest.version,
      bumpTypeEnv ? (SEMVER as any)[bumpTypeEnv.toUpperCase()] : undefined,
      bumpStableOrCanary ? bumpStableOrCanary : undefined
    )
    log.info(`${manifest.name}: ${manifest.version} → ${nextVersion}`)
    manifestNextVersions.push([manifest, nextVersion])
  }

  log.groupEnd()

// --- strategy 3: push-triggered ---

} else if (process.env.GITHUB_EVENT) {
  log.group("bumping based on push commit messages...")

  const githubEvent = JSON.parse(process.env.GITHUB_EVENT)
  const perManifestBump = new Map<string, number>()

  const commitItems = githubEvent.commits
    .map((c: any) => c.message)
    .map(parseCommitMessage)
    .flatMap((c: ParsedCommit) => c.items)

  for (const item of commitItems) {
    const level = CONVENTIONAL_TO_SEMVER[item.type]
    if (level === undefined) continue

    if (item.scopes.length === 0) {
      log.debug(`skipping commit item with no scope: ${item.raw}`)
      continue
    }

    for (const scope of item.scopes) {
      const manifest = findManifestByName(manifests, scope)
      if (!manifest) {
        log.debug(`skipping commit item with unknown scope: ${scope}`)
        continue
      }

      if ((perManifestBump.get(manifest.name) ?? -1) < level) {
        perManifestBump.set(manifest.name, level)
      }
    }
  }

  for (const [name, semver] of perManifestBump) {
    const manifest = findManifestByName(manifests, name)!
    const nextVersion = calculateNextSemver(manifest.version, semver)
    log.info(`${manifest.name}: ${manifest.version} → ${nextVersion}`)
    manifestNextVersions.push([manifest, nextVersion])
  }

  log.groupEnd()
}

// --- write versions → commit → tag ---

log.info(
  `versions to apply: ${
    manifestNextVersions.map(([m, v]) => `${m.name}@${v}`).join(", ") || "(none)"
  }`
)

for (const [manifest, newVersion] of manifestNextVersions) {
  await updateManifest((manifest as any).path, newVersion)
  log.info(`updated ${manifest.name} → ${newVersion}`)
}

if (manifestNextVersions.length !== 0) {
  await commitAndPush(
    dir,
    withCoAuthors(
      "chore[skip bump]: bumping stable release versions for " +
      manifestNextVersions.map(([m]) => m.name).join(", "),
      [GITHUB_ACTIONS_BOT]
    )
  )
  log.info("committed and pushed version bump")
}

for (const [manifest, newVersion] of manifestNextVersions) {
  const annotation: TagAnnotation = {
    deployTargets: manifest.deployTargets ?? []
  }
  await tagAndPush(`${manifest.name}@${newVersion}`, annotation)
  log.info(`tagged ${manifest.name}@${newVersion} (deployTargets: ${annotation.deployTargets.join(", ") || "none"})`)
}

// --- post-stable: advance to next prerelease ---

if (bumpToCalculatedStableEnv && manifestNextVersions.length !== 0) {
  log.group(`creating next ${prereleaseChannel} versions after stable release...`)

  const prereleaseNextVersions: [Manifest, string][] = []

  for (const [manifest, stableVersion] of manifestNextVersions) {
    const nextPrerelease = calculateNextSemver(stableVersion, undefined, prereleaseChannel)
    log.info(`${manifest.name}: ${stableVersion} → ${nextPrerelease} (${prereleaseChannel})`)
    prereleaseNextVersions.push([manifest, nextPrerelease])
  }

  for (const [manifest, newVersion] of prereleaseNextVersions) {
    await updateManifest((manifest as any).path, newVersion)
  }

  await commitAndPush(
    dir,
    withCoAuthors(
      `chore[skip bump]: bumping ${prereleaseChannel} versions after stable release for ` +
      prereleaseNextVersions.map(([m]) => m.name).join(", "),
      [GITHUB_ACTIONS_BOT]
    )
  )

  log.info(`committed ${prereleaseChannel} version bump (no tags created)`)
  log.groupEnd()
}

// --- cleanup: delete old prerelease docker images from ghcr ---

if (bumpToCalculatedStableEnv && manifestNextVersions.length !== 0) {
  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPOSITORY

  if (token && repo) {
    const [owner, repositoryName] = repo.split("/")

    for (const [manifest] of manifestNextVersions) {
      const imageSuffix = manifestNameToImageName(manifest.name)
      if (!imageSuffix) {
        log.info(`skipping prerelease cleanup for "${manifest.name}" — could not derive image name`)
        continue
      }

      const imageName = `${repositoryName}/${imageSuffix}`
      try {
        await deletePrereleaseImages(owner, imageName, token)
      } catch (err) {
        log.error(`failed to clean prerelease images for ${manifest.name}: ${err}`)
      }
    }
  } else {
    log.info("GITHUB_TOKEN or GITHUB_REPOSITORY not set, skipping prerelease image cleanup")
  }
}

log.info("bump-version complete")
log.groupEnd()
