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
  /** changes for preview.yml builds only, e.g. skip a slow training step */
  preview?: DockerBuildPreview
}

export interface DockerBuildPreview {
  /** overrides `build_args`; a null value drops the arg */
  build_args?: Record<string, string | null>
  network?: string
  /** false drops the service container */
  service?: false
}

/** `docker` in .justactions.yml: docker build settings of every module */
export interface DockerSettings {
  builder?: DockerBuilderSettings
}

export type CacheExport = "max" | "min" | "off"

/**
 * `docker.builder`: build with a named buildx builder that outlives the
 * job instead of a throwaway one per job, so on a persistent self-hosted
 * runner BuildKit's local cache and `RUN --mount=type=cache` mounts stay
 */
export interface DockerBuilderSettings {
  persistent: boolean
  /** builder name; a build with network host uses `<name>-host` */
  name?: string
  /** registry cache export on self-hosted runners; github-hosted runs keep `max` */
  cache_to?: CacheExport
}

export const DEFAULT_BUILDER_NAME = "justactions"
const CACHE_EXPORTS: CacheExport[] = ["max", "min", "off"]

export interface DockerBuildService {
  image: string
  /** published on the same port of the runner's loopback */
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
  service_options: string
  /** persistent buildx builder, empty for setup-buildx's throwaway one */
  builder: string
  /** registry cache export with the persistent builder on a self-hosted runner */
  cache_to: CacheExport
}

function overrideFor(settings: Settings, moduleName: string) {
  return settings.modules?.overrides?.find((o) => o.name === moduleName)
}

export function hasDockerBuild(settings: Settings, moduleName: string): boolean {
  return overrideFor(settings, moduleName)?.docker !== undefined || settings.docker?.builder?.persistent === true
}

export function dockerBuildFor(
  settings: Settings,
  moduleName: string,
  opts: { preview?: boolean } = {}
): ResolvedDockerBuild {
  const base = overrideFor(settings, moduleName)?.docker ?? {}
  const docker = opts.preview ? applyPreview(base) : base
  const service = docker.service
  // the port goes into the options too: a workflow can't leave an empty `ports` entry.
  // loopback only: a self-hosted runner's host may have a public IP, and the service is a
  // throwaway with a weak password (an open postgres gets a cryptominer within minutes)
  const port = service?.port ? [`-p 127.0.0.1:${service.port}:${service.port}`] : []
  const env = Object.entries(service?.env ?? {}).map(([k, v]) => `-e ${k}=${v}`)
  const network = docker.network ?? ""

  return {
    build_args: docker.build_args ?? {},
    secrets: docker.secrets ?? {},
    network,
    service_image: service?.image ?? "",
    service_options: [...port, ...env, service?.options ?? ""].join(" ").trim(),
    ...builderFor(settings, network)
  }
}

// driver opts are fixed when a builder is created, so a host-network build gets a builder of its own
function builderFor(settings: Settings, network: string): Pick<ResolvedDockerBuild, "builder" | "cache_to"> {
  const builder = settings.docker?.builder
  if (!builder?.persistent) return { builder: "", cache_to: "max" }
  const name = builder.name || DEFAULT_BUILDER_NAME
  return { builder: network === "host" ? `${name}-host` : name, cache_to: builder.cache_to ?? "min" }
}

/**
 * the cache-to mode a build uses: the persistent builder keeps its own
 * cache only on a self-hosted runner (RUNNER_ENVIRONMENT), so a
 * github-hosted run exports everything, as without the builder
 */
export function cacheExportFor(build: Pick<ResolvedDockerBuild, "builder" | "cache_to">, runnerEnvironment: string): CacheExport {
  if (!build.builder || runnerEnvironment !== "self-hosted") return "max"
  return build.cache_to
}

function applyPreview(docker: DockerBuildSettings): DockerBuildSettings {
  const preview = docker.preview
  if (!preview) return docker

  const buildArgs = { ...docker.build_args }
  for (const [k, v] of Object.entries(preview.build_args ?? {})) {
    if (v === null) delete buildArgs[k]
    else buildArgs[k] = v
  }
  return {
    ...docker,
    build_args: buildArgs,
    network: preview.network ?? docker.network,
    service: preview.service === false ? undefined : docker.service
  }
}

export function validateDockerBuild(settings: Settings): string[] {
  const errors: string[] = []
  const builder = settings.docker?.builder
  if (builder?.name !== undefined && !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(builder.name)) {
    errors.push(`docker.builder.name must be letters, digits, ".", "_" or "-", got "${builder.name}"`)
  }
  if (builder?.cache_to !== undefined && !CACHE_EXPORTS.includes(builder.cache_to)) {
    errors.push(`docker.builder.cache_to must be "max", "min" or "off", got "${builder.cache_to}"`)
  }
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
