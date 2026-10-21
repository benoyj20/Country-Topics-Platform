// Which environment a process belongs to, and the start-up checks that stop
// one environment running with another's addresses (ADR 0014,
// "Environments"). Plain functions over the environment variables, shared by
// the site, the worker, and the backup tool. Problems name the variable,
// never its value.

export const APP_ENVIRONMENTS = ["local", "staging", "production"] as const;
export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

/**
 * APP_ENV when unset. Local accepts only this machine's addresses, so a
 * hosted environment that forgets APP_ENV refuses to start rather than run
 * with local rules.
 */
export const DEFAULT_APP_ENVIRONMENT: AppEnvironment = "local";

// URL.hostname keeps the brackets around an IPv6 address.
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Cloudflare's quick tunnels: the free, temporary addresses that show a
 * local environment to someone else, as for a demo (ADR 0014, "Until a
 * launch").
 */
const QUICK_TUNNEL_DOMAIN = "trycloudflare.com";

/** Staging lives at dev.<domain>, production at <domain> (ADR 0014). */
const STAGING_LABEL = "dev";

type Env = Record<string, string | undefined>;

function isAppEnvironment(value: string): value is AppEnvironment {
  return (APP_ENVIRONMENTS as readonly string[]).includes(value);
}

/** APP_ENV: `local` (the default), `staging`, or `production`. */
export function readAppEnvironment(
  env: Env,
  problems: string[],
): AppEnvironment {
  const value = env.APP_ENV?.trim().toLowerCase() || DEFAULT_APP_ENVIRONMENT;
  if (isAppEnvironment(value)) return value;
  problems.push(`APP_ENV must be one of: ${APP_ENVIRONMENTS.join(", ")}`);
  return DEFAULT_APP_ENVIRONMENT;
}

/** Whether `hostname`, as URL.hostname gives it, is this machine. */
export function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname);
}

function isQuickTunnelHostname(hostname: string): boolean {
  // One label before the domain, exactly as the tunnel hands it out.
  const [label, ...rest] = hostname.split(".");
  return Boolean(label) && rest.join(".") === QUICK_TUNNEL_DOMAIN;
}

function parsedUrl(value: string): URL | undefined {
  return URL.canParse(value) ? new URL(value) : undefined;
}

/**
 * Adds a problem when `value`, the app's own public address (SITE_URL),
 * belongs to another environment:
 * - local: this machine, or a quick tunnel for a demo;
 * - staging: HTTPS at a `dev.` host;
 * - production: HTTPS at any other public host.
 * Hosts are compared label by label, never by suffix, since staging's
 * address ends with production's. An unparsable value is left for the
 * caller's own check to report.
 */
export function checkSiteAddress(
  environment: AppEnvironment,
  name: string,
  value: string,
  problems: string[],
): void {
  const url = parsedUrl(value);
  if (!url) return;
  const { hostname } = url;
  const local = isLoopbackHostname(hostname) || isQuickTunnelHostname(hostname);
  const staging = hostname.split(".")[0] === STAGING_LABEL;

  if (environment === "local") {
    if (!local) {
      problems.push(
        `${name} must be localhost or a quick-tunnel address (*.${QUICK_TUNNEL_DOMAIN}) when APP_ENV is local`,
      );
    }
    return;
  }
  if (url.protocol !== "https:" || local) {
    problems.push(
      `${name} must be a public https:// address when APP_ENV is ${environment}`,
    );
    return;
  }
  if (environment === "staging" && !staging) {
    problems.push(
      `${name} must be the staging address, dev.<domain>, when APP_ENV is staging`,
    );
  }
  if (environment === "production" && staging) {
    problems.push(
      `${name} is a staging address (dev.<domain>); production uses <domain>`,
    );
  }
}

/**
 * Adds a problem when `value`, the address of a service such as the
 * database or storage, cannot belong to a hosted environment. Staging and
 * production never use a service on their own machine's loopback address,
 * and reach any http(s) service over HTTPS. Local may use anything.
 */
export function checkServiceAddress(
  environment: AppEnvironment,
  name: string,
  value: string | undefined,
  problems: string[],
): void {
  if (environment === "local" || !value) return;
  const url = parsedUrl(value);
  if (!url) return;
  if (isLoopbackHostname(url.hostname)) {
    problems.push(
      `${name} must not point at this machine (localhost) when APP_ENV is ${environment}`,
    );
  } else if (url.protocol === "http:") {
    problems.push(`${name} must use https:// when APP_ENV is ${environment}`);
  }
}
