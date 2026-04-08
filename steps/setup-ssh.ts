// setup-ssh.ts
// ---
// step: provision ssh credentials for subsequent scp / ssh steps.
// writes the private key to `~/.ssh/id_rsa`, scans host keys, and
// installs `sshpass` (needed by some transfer scripts).
//
// env:
//   SSH_PRIVATE_KEY — private key content (required)
//   SSH_HOST        — hostname to add to known_hosts (required)
// ---

import { $ } from "bun";
import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { getRequiredEnv, log } from "./_lib/github";

const privateKey = getRequiredEnv("SSH_PRIVATE_KEY");
const host = getRequiredEnv("SSH_HOST");

const sshDir = `${process.env.HOME}/.ssh`;

log.info(`setting up ssh key for host: ${host}`);

// create ~/.ssh if it doesn't exist
mkdirSync(sshDir, { recursive: true });

// write private key with strict permissions (owner-only read/write)
const keyPath = `${sshDir}/id_rsa`;
writeFileSync(keyPath, privateKey + "\n", "utf-8");
chmodSync(keyPath, 0o600);
log.info("ssh private key written");

// add the host's public keys to known_hosts so ssh doesn't prompt
log.info("scanning host keys...");
await $`ssh-keyscan -p 22 ${host} >> ${sshDir}/known_hosts`;

// install sshpass (required for password-based auth in some setups)
log.info("installing sshpass...");
await $`sudo apt-get install -y sshpass`.quiet();

log.info(`ssh setup complete for ${host}`);
