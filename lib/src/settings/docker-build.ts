import type { Settings } from "./index"

/** per-module docker build settings, `modules.overrides[].docker` in .justactions.yml */
export interface DockerBuildSettings {
  /** extra build args; values may reference `${{ vars.NAME }}` / `${{ secrets.NAME }}` */
  build_args?: Record<string, string>
  /** extra BuildKit secrets (id -> value); values may reference vars and secrets */
  secrets?: Record<string, string>
  /** docker build network, e.g. "host" so RUN steps reach `service` on localhost */
  network?: string
  /** a container started next to the build job, e.g. a throwaway database */
  service?: DockerBuildService
}

export interface DockerBuildService {
  image: string
  /** published on the same port of the runner */
  port?: string
  env?: Record<string, string>
  /** extra `docker create` options, e.g. a health check */
  options?: string
}

/**
 * what the workflows read: flat strings, empty when unset, so a job
 * without settings builds exactly as before. the values of build_args
 * and secrets are still templates — renderDockerBuild fills them in the
 * job that has the secrets.
 */
export interface ResolvedDockerBuild {
  build_args: Record<string, string>
  secrets: Record<string, string>
  network: string
  service_image: string
  service_ports: string
  service_options: string
}

function overrideFor(settings: Settings, moduleName: string) {
  return settings.modules?.overrides?.find((o) => o.name === moduleName)
}

export function hasDockerBuild(settings: Settings, moduleName: string): boolean {
  return overrideFor(settings, moduleName)?.docker !== undefined
}

export function dockerBuildFor(settings: Settings, moduleName: string): ResolvedDockerBuild {
  const docker = overrideFor(settings, moduleName)?.docker ?? {}
  const service = docker.service
  const env = Object.entries(service?.env ?? {}).map(([k, v]) => `-e ${k}=${v}`)

  return {
    build_args: docker.build_args ?? {},
    secrets: docker.secrets ?? {},
    network: docker.network ?? "",
    service_image: service?.image ?? "",
    service_ports: service?.port ? `${service.port}:${service.port}` : "",
    service_options: [...env, service?.options ?? ""].join(" ").trim()
  }
}

export function validateDockerBuild(settings: Settings): string[] {
  const errors: string[] = []
  for (const override of settings.modules?.overrides ?? []) {
    const service = override.docker?.service
    if (!service) continue
    const at = `modules.overrides[${override.name}].docker.service`
    if (!service.image) errors.push(`${at}.image is required`)
    if (service.port && !/^\d+$/.test(service.port)) errors.push(`${at}.port must be a number, got "${service.port}"`)
    // the env lands in `docker create` options, which are split on whitespace
    for (const [k, v] of Object.entries(service.env ?? {})) {
      if (/\s/.test(v)) errors.push(`${at}.env.${k} must not contain whitespace`)
    }
  }
  return errors
}

const REF = /\$\{\{\s*(vars|secrets)\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g

export interface RenderContext {
  vars: Record<string, string>
  secrets: Record<string, string>
}

/** fills `${{ vars.NAME }}` / `${{ secrets.NAME }}`; an unset one is empty, like in a workflow */
export function fillRefs(value: string, ctx: RenderContext, missing: string[] = []): string {
  const filled = value.replace(REF, (_, scope: "vars" | "secrets", name: string) => {
    const v = ctx[scope][name]
    if (v === undefined) missing.push(`${scope}.${name}`)
    return v ?? ""
  })
  if (filled.includes("${{")) throw new Error(`only \${{ vars.NAME }} and \${{ secrets.NAME }} are supported, got "${value}"`)
  return filled
}

/** `KEY=value` lines for docker/build-push-action's build-args / secrets inputs */
export function renderDockerBuild(
  build: Pick<ResolvedDockerBuild, "build_args" | "secrets">,
  ctx: RenderContext
): { build_args: string; secrets: string; missing: string[] } {
  const missing: string[] = []
  const lines = (map: Record<string, string>) =>
    Object.entries(map).map(([k, v]) => `${k}=${fillRefs(v, ctx, missing)}`).join("\n")

  return { build_args: lines(build.build_args), secrets: lines(build.secrets), missing }
}
