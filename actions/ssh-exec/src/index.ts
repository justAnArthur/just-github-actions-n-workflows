import { getEnv, getRequiredEnv, log } from "@justanarthur/just-github-actions-n-workflows-lib/github"

log.group("ssh-remote-exec")

const host = getRequiredEnv("SSH_EXEC_HOST")
const username = getRequiredEnv("SSH_EXEC_USERNAME")
const script = getRequiredEnv("SSH_EXEC_SCRIPT")
const aliveInterval = getEnv("SSH_EXEC_ALIVE_INTERVAL", "60")
const aliveCountMax = getEnv("SSH_EXEC_ALIVE_COUNT", "5")

log.info(`target: ${username}@${host}`)
log.info(`keepalive: interval=${aliveInterval}s, max=${aliveCountMax}`)

const scriptLines = script.split("\n").filter(Boolean)
log.info(`script: ${scriptLines.length} line(s)`)
for (const line of scriptLines) {
  log.debug(`  > ${line}`)
}
log.groupEnd()

// the script goes in on stdin and the remote output streams into the job log,
// so a failing deploy shows why
log.info(`executing remote script on ${host}...`)
const ssh = Bun.spawn(
  [
    "ssh",
    "-o", "StrictHostKeyChecking=no",
    "-o", `ServerAliveInterval=${aliveInterval}`,
    "-o", `ServerAliveCountMax=${aliveCountMax}`,
    `${username}@${host}`,
    "bash -s"
  ],
  { stdin: new Blob([script + "\n"]), stdout: "inherit", stderr: "inherit" }
)
const code = await ssh.exited

if (code !== 0) {
  log.error(`remote script on ${host} failed with exit code ${code}`)
  process.exit(code)
}
log.info(`remote execution on ${host} complete`)
