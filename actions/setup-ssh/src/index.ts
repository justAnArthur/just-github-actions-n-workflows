import { $ } from "bun"
import { chmodSync, mkdirSync, writeFileSync } from "node:fs"
import { getRequiredEnv, log } from "@justanarthur/actions-lib/github"

const privateKey = getRequiredEnv("SSH_PRIVATE_KEY")
const host = getRequiredEnv("SSH_HOST")

const sshDir = `${process.env.HOME}/.ssh`

log.group("setup-ssh-keys")
log.info(`host: ${host}`)
log.info(`ssh dir: ${sshDir}`)

mkdirSync(sshDir, { recursive: true })

const keyPath = `${sshDir}/id_rsa`
writeFileSync(keyPath, privateKey + "\n", "utf-8")
chmodSync(keyPath, 0o600)
log.info("ssh private key written")

log.info("scanning host keys...")
await $`ssh-keyscan -p 22 ${host} >> ${sshDir}/known_hosts`

log.info("installing sshpass...")
await $`sudo apt-get install -y sshpass`.quiet()

log.info(`ssh setup complete for ${host}`)
log.groupEnd()

