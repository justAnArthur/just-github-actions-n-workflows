import { type DeployHookTarget, STABLE_CHANNEL } from "./settings"

export interface HookPlanEntry {
  name: string;
  target: DeployHookTarget;
  fire: boolean;
  /** why the target is skipped; empty when it fires */
  reason: string;
}

/** a tag's release channel: its prerelease identifier, or "stable" */
export function releaseChannel(prereleaseChannel: string | undefined): string {
  return prereleaseChannel || STABLE_CHANNEL
}

export function planDeployHooks(
  targets: Record<string, DeployHookTarget>,
  pkgName: string,
  channel: string
): HookPlanEntry[] {
  return Object.entries(targets).map(([name, target]) => {
    if (target.packages.length > 0 && !target.packages.includes(pkgName)) {
      return { name, target, fire: false, reason: `package ${pkgName} not in [${target.packages.join(", ")}]` }
    }
    if (!target.channels.includes(channel)) {
      return { name, target, fire: false, reason: `channel ${channel} not in [${target.channels.join(", ")}]` }
    }
    return { name, target, fire: true, reason: "" }
  })
}

/** parses the `toJSON(secrets)` blob a workflow passes in; never echoes values */
export function parseSecrets(json: string): Record<string, string> {
  if (!json) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error("secrets input is not valid JSON — pass `${{ toJSON(secrets) }}`")
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("secrets input must be a JSON object of secret name → value")
  }
  return parsed as Record<string, string>
}

export interface HookResult {
  name: string;
  status: "fired" | "skipped" | "failed";
  detail: string;
}

export function renderHookSummary(tag: string, channel: string, results: HookResult[]): string {
  const rows = results.map((r) => `| \`${r.name}\` | ${r.status} | ${r.detail.replace(/\|/g, "\\|")} |`)
  return [
    `### deploy hooks — \`${tag}\` (channel: \`${channel}\`)`,
    "",
    "| target | status | detail |",
    "|--------|--------|--------|",
    ...rows,
    ""
  ].join("\n")
}
