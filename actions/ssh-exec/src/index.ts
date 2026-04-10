import { getEnv, getRequiredEnv, log } from "@justanarthur/actions-lib/github"
import { exec } from "@justanarthur/actions-lib/exec"

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

const sshCommand = [
  "ssh",
  "-o", "StrictHostKeyChecking=no",
  "-o", `ServerAliveInterval=${aliveInterval}`,
  "-o", `ServerAliveCountMax=${aliveCountMax}`,
  `${username}@${host}`,
  "bash -s"
].join(" ")

const fullCommand = `${sshCommand} << 'ENDSSH'\n${script}\nENDSSH`

log.info("executing remote script...")
await exec(fullCommand)

log.info(`remote execution on ${host} complete`)
log.groupEnd()

