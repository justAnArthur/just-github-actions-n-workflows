// deploy-compose-remote/src/index.ts
// ---
// generates the remote deployment script for docker compose.
// builds the SSH command sequence: registry login, compose pull,
// compose up, cleanup. outputs the script for use with ssh-exec.
// ---

import { getRequiredEnv, getEnv, log, setOutput } from "@justanarthur/just-github-actions-n-workflows-lib/github"

log.group("deploy-compose-remote")

const targetPath = getRequiredEnv("TARGET_PATH")
const registryUsername = getEnv("REGISTRY_USERNAME", "")
const registryPassword = getEnv("REGISTRY_PASSWORD", "")
const registry = getEnv("REGISTRY", "ghcr.io")

log.info(`target path: ${targetPath}`)
log.info(`registry: ${registry}`)

// --- build deployment script ---

const scriptLines: string[] = [
  "set -euo pipefail",
  "",
  `echo "Changing to target directory: ${targetPath}"`,
  `cd "${targetPath}"`,
  ""
]

// registry login (optional)
if (registryUsername && registryPassword) {
  scriptLines.push(
    `echo "Logging in to container registry (${registry})"`,
    `echo "${registryPassword}" | sudo docker login ${registry} -u "${registryUsername}" --password-stdin || true`,
    ""
  )
}

// compose command detection + deploy
scriptLines.push(
  'if command -v docker >/dev/null 2>&1 && sudo docker compose version >/dev/null 2>&1; then',
  '  DOCKER_COMPOSE_CMD="sudo docker compose"',
  'else',
  '  DOCKER_COMPOSE_CMD="sudo docker-compose"',
  'fi',
  '',
  'echo "Using compose command: $DOCKER_COMPOSE_CMD"',
  'echo "Pulling images..."',
  '$DOCKER_COMPOSE_CMD pull --ignore-pull-failures || true',
  '',
  'echo "Bringing up services..."',
  '$DOCKER_COMPOSE_CMD up -d --remove-orphans --force-recreate',
  '',
  'echo "Listing running containers:"',
  '$DOCKER_COMPOSE_CMD ps',
  '',
  'echo "Cleaning up unused Docker objects..."',
  'sudo docker system prune -f --volumes',
  '',
  'echo "Deployment finished."'
)

const script = scriptLines.join("\n")

log.info("generated deployment script")
log.debug(script)

setOutput("script", script)

log.groupEnd()

