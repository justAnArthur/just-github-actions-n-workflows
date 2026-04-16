import { $ } from "bun"
import { stat } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { getRequiredEnv, log } from "@justanarthur/just-github-actions-n-workflows-lib/github"

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory()
  } catch {
    return false
  }
}

function isComposeFile(path: string): boolean {
  const fileName = basename(path).toLowerCase()
  return fileName === "docker-compose.yml" || fileName === "docker-compose.yaml"
}

async function resolveSourceFiles(source: string): Promise<string[]> {
  const sourceFiles = source.split(/\s+/).filter(Boolean)
  const seen = new Set(sourceFiles)

  for (const file of sourceFiles) {
    if (!isComposeFile(file)) {
      continue
    }

    const dockerDir = join(dirname(file), "docker")
    if (seen.has(dockerDir)) {
      continue
    }

    if (await isDirectory(dockerDir)) {
      sourceFiles.push(dockerDir)
      seen.add(dockerDir)
      log.info(`detected sibling docker directory: ${dockerDir}`)
    }
  }

  return sourceFiles
}

log.group("scp-upload")

const host = getRequiredEnv("SCP_HOST")
const username = getRequiredEnv("SCP_USERNAME")
const source = getRequiredEnv("SCP_SOURCE")
const target = getRequiredEnv("SCP_TARGET")

log.info(`destination: ${username}@${host}:${target}`)
log.info(`source: ${source}`)

const sourceFiles = await resolveSourceFiles(source)
log.info(`${sourceFiles.length} file(s) to transfer`)

for (const file of sourceFiles) {
  log.info(`  copying ${file}...`)
  await $`scp -r -v -o StrictHostKeyChecking=no ${file} ${username}@${host}:${target}`
  log.info(`  ${file} transferred`)
}

log.info("scp transfer complete")
log.groupEnd()

