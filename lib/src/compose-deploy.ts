import { remoteShellPath, singleQuote } from "./remote-path"

export interface ComposeDeployOptions {
  targetPath: string
  registries: string[]
  username?: string
  password?: string
}

const DETECT_DOCKER = [
  "# Detect whether Docker is available directly or via passwordless sudo.",
  "if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then",
  '  DOCKER_BIN="docker"',
  "elif command -v sudo >/dev/null 2>&1 && command -v docker >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then",
  '  DOCKER_BIN="sudo docker"',
  "else",
  '  echo "ERROR: Docker is not accessible for this user and passwordless sudo is not configured."',
  '  echo "Hint: add the deploy user to the docker group, or allow passwordless sudo for docker commands."',
  "  exit 1",
  "fi"
]

const DETECT_COMPOSE = [
  "if $DOCKER_BIN compose version >/dev/null 2>&1; then",
  '  DOCKER_COMPOSE_CMD="$DOCKER_BIN compose"',
  "elif command -v docker-compose >/dev/null 2>&1; then",
  '  if [ "$DOCKER_BIN" = "docker" ]; then',
  '    DOCKER_COMPOSE_CMD="docker-compose"',
  "  else",
  '    DOCKER_COMPOSE_CMD="sudo docker-compose"',
  "  fi",
  "else",
  "  echo 'ERROR: Neither `docker compose` nor `docker-compose` is available on target host.'",
  "  exit 1",
  "fi"
]

function loginLines(registry: string, username: string, password: string): string[] {
  return [
    `echo "Logging in to container registry (${registry})"`,
    `if ! printf '%s' ${singleQuote(password)} | $DOCKER_BIN login ${singleQuote(registry)} -u ${singleQuote(username)} --password-stdin; then`,
    `  echo "WARNING: login to ${registry} failed, pulling with the existing credentials" >&2`,
    "fi"
  ]
}

export function composeDeployScript({ targetPath, registries, username, password }: ComposeDeployOptions): string {
  const dir = remoteShellPath(targetPath)
  const lines = [
    "set -euo pipefail",
    "",
    `echo "Changing to target directory: "${dir}`,
    `cd ${dir}`,
    "",
    ...DETECT_DOCKER,
    ""
  ]

  if (username && password) {
    for (const registry of [...new Set(registries)]) lines.push(...loginLines(registry, username, password), "")
  }

  lines.push(
    ...DETECT_COMPOSE,
    "",
    'echo "Using compose command: $DOCKER_COMPOSE_CMD"',
    // frees disk before the pull; images of running containers are kept
    'echo "Removing unused images..."',
    "$DOCKER_BIN image prune -af || true",
    "",
    'echo "Pulling images..."',
    "$DOCKER_COMPOSE_CMD pull --ignore-pull-failures || true",
    "",
    'echo "Bringing up services..."',
    "$DOCKER_COMPOSE_CMD up -d --remove-orphans --force-recreate",
    "",
    'echo "Listing running containers:"',
    "$DOCKER_COMPOSE_CMD ps",
    "",
    // no --volumes: older docker prunes named volumes with it
    'echo "Cleaning up unused Docker objects..."',
    "$DOCKER_BIN system prune -af || true",
    "",
    'echo "Deployment finished."'
  )

  return lines.join("\n")
}
