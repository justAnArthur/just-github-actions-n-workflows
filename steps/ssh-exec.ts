// ssh-exec.ts
// ---
// step: ssh into a remote server and execute a script.
// the script content is piped via stdin using a heredoc, so it can
// be multiline without escaping issues.
//
// env:
//   SSH_EXEC_HOST           — server ip or domain (required)
//   SSH_EXEC_USERNAME       — ssh username (required)
//   SSH_EXEC_SCRIPT         — script body to run remotely (required)
//   SSH_EXEC_ALIVE_INTERVAL — keepalive interval in seconds (default: "60")
//   SSH_EXEC_ALIVE_COUNT    — max unanswered keepalives (default: "5")
// ---

import { getEnv, getRequiredEnv, log } from "./_lib/github";
import { exec } from "./_lib/exec";

const host = getRequiredEnv("SSH_EXEC_HOST");
const username = getRequiredEnv("SSH_EXEC_USERNAME");
const script = getRequiredEnv("SSH_EXEC_SCRIPT");
const aliveInterval = getEnv("SSH_EXEC_ALIVE_INTERVAL", "60");
const aliveCountMax = getEnv("SSH_EXEC_ALIVE_COUNT", "5");

log.info(`executing remote commands on ${username}@${host}`);
log.info(`keepalive: interval=${aliveInterval}s, max=${aliveCountMax}`);

// build the ssh command with keepalive options
const sshCommand = [
  "ssh",
  "-o", "StrictHostKeyChecking=no",
  "-o", `ServerAliveInterval=${aliveInterval}`,
  "-o", `ServerAliveCountMax=${aliveCountMax}`,
  `${username}@${host}`,
  "bash -s",
].join(" ");

// pipe the script via stdin using a heredoc
const fullCommand = `${sshCommand} << 'ENDSSH'\n${script}\nENDSSH`;

await exec(fullCommand);

log.info(`remote execution on ${host} complete`);
