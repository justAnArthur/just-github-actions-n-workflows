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
  "",
  '# Detect whether Docker is available directly or via passwordless sudo.',
  'if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then',
  '  DOCKER_BIN="docker"',
  'elif command -v sudo >/dev/null 2>&1 && command -v docker >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then',
  '  DOCKER_BIN="sudo docker"',
  'else',
  '  echo "ERROR: Docker is not accessible for this user and passwordless sudo is not configured."',
  '  echo "Hint: add the deploy user to the docker group, or allow passwordless sudo for docker commands."',
  '  exit 1',
  'fi',
  ""
]

// registry login (optional)
if (registryUsername && registryPassword) {
  scriptLines.push(
    `echo "Logging in to container registry (${registry})"`,
    `echo "${registryPassword}" | $DOCKER_BIN login ${registry} -u "${registryUsername}" --password-stdin || true`,
    ""
  )
}

// compose command detection + deploy
scriptLines.push(
  'if $DOCKER_BIN compose version >/dev/null 2>&1; then',
  '  DOCKER_COMPOSE_CMD="$DOCKER_BIN compose"',
  'elif command -v docker-compose >/dev/null 2>&1; then',
  '  if [ "$DOCKER_BIN" = "docker" ]; then',
  '    DOCKER_COMPOSE_CMD="docker-compose"',
  '  else',
  '    DOCKER_COMPOSE_CMD="sudo docker-compose"',
  '  fi',
  'else',
  '  echo "ERROR: Neither \`docker compose\` nor \`docker-compose\` is available on target host."',
  '  exit 1',
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
  '$DOCKER_BIN system prune -f --volumes',
  '',
  'echo "Deployment finished."'
)

const script = scriptLines.join("\n")

log.info("generated deployment script")
log.debug(script)

setOutput("script", script)

log.groupEnd()

