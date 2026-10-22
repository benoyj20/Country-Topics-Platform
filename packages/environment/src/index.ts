// Which environment a process belongs to, and the start-up checks that stop
// one environment running with another's addresses (ADR 0014,
// "Environments"). Plain functions over the environment variables, shared by
// the site, the worker, and the backup tool. Problems name the variable,
// never its value.

export const APP_ENVIRONMENTS = ["local", "staging", "production"] as const;
export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

/**
 * APP_ENV when unset. Local accepts only this machine's addresses and its
 * containers' (see checkServiceAddress), so a hosted process that forgets
 * APP_ENV refuses to start rather than run with local rules.
 */
export const DEFAULT_APP_ENVIRONMENT: AppEnvironment = "local";

/**
 * Cloudflare's quick tunnels: the free, temporary addresses that show a
 * local environment to someone else, as for a demo (ADR 0014, "Until a
 * launch").
 */
const QUICK_TUNNEL_DOMAIN = "trycloudflare.com";

/** Staging lives at dev.<domain>, production at <domain> (ADR 0014). */
const STAGING_LABEL = "dev";

/** How Docker names the machine it runs on, from inside a container. */
const DOCKER_HOST_NAME = "host.docker.internal";

/** Sentry's label for each environment; local keeps ADR 0012's label. */
const ERROR_ENVIRONMENTS: Record<AppEnvironment, string> = {
  local: "development",
  staging: "staging",
  production: "production",
};

type Env = Record<string, string | undefined>;

function isAppEnvironment(value: string): value is AppEnvironment {
  return (APP_ENVIRONMENTS as readonly string[]).includes(value);
}

/**
 * APP_ENV: `local` (the default), `staging`, or `production`. Undefined for
 * any other value, after a problem is added, so callers skip the address
 * checks instead of reporting them under the wrong environment's rules.
 */
export function readAppEnvironment(
  env: Env,
  problems: string[],
): AppEnvironment | undefined {
  const value = env.APP_ENV?.trim().toLowerCase() || DEFAULT_APP_ENVIRONMENT;
  if (isAppEnvironment(value)) return value;
  problems.push(`APP_ENV must be one of: ${APP_ENVIRONMENTS.join(", ")}`);
  return undefined;
}

/** The Sentry environment to use when SENTRY_ENVIRONMENT is unset. */
export function errorEnvironmentFor(
  environment: AppEnvironment | undefined,
): string {
  return ERROR_ENVIRONMENTS[environment ?? DEFAULT_APP_ENVIRONMENT];
}

/**
 * The http(s) origin in variable `name`, without a trailing slash. A path
 * is refused: each app lives at the root of its host.
 */
export function readOrigin(
  env: Env,
  name: string,
  problems: string[],
  example: string,
): string {
  const value = env[name]?.trim() ?? "";
  if (URL.canParse(value)) {
    const url = new URL(value);
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.pathname === "/"
    ) {
      return url.origin;
    }
  }
  problems.push(`${name} must be an http(s) origin, such as ${example}`);
  return value;
}

/** SITE_URL, the app's public address, as its origin. */
export function readSiteUrl(env: Env, problems: string[]): string {
  return readOrigin(env, "SITE_URL", problems, "http://localhost:3000");
}

/**
 * BACKEND_URL, the backend's own address (ADR 0014), as its origin. The
 * frontend passes every request there; it must not be the site's.
 */
export function readBackendUrl(
  env: Env,
  siteUrl: string,
  problems: string[],
): string {
  const backendUrl = readOrigin(
    env,
    "BACKEND_URL",
    problems,
    "http://localhost:3002",
  );
  if (backendUrl === siteUrl) {
    problems.push(
      "BACKEND_URL must differ from SITE_URL, which is the frontend's address",
    );
  }
  return backendUrl;
}

/** Secrets and signing keys shorter than this are guessable. */
export const MIN_SECRET_LENGTH = 32;

/** The secret in variable `name`, trimmed; never echoed in a problem. */
export function readSecret(env: Env, name: string, problems: string[]): string {
  const value = env[name]?.trim() ?? "";
  if (value.length < MIN_SECRET_LENGTH) {
    problems.push(
      `${name} must be at least ${MIN_SECRET_LENGTH} characters; leave it empty in .env and run "make env" to generate one`,
    );
  }
  return value;
}

const SITE_OPERATOR_MAX_LENGTH = 200;

/**
 * Who runs the site and how to reach them, as the privacy policy and terms
 * name them (ADR 0011). Both are optional: the pages mark what is missing.
 */
export function readLegalContacts(
  env: Env,
  problems: string[],
): { contactEmail?: string; siteOperator?: string } {
  const contactEmail = env.CONTACT_EMAIL?.trim() || undefined;
  if (contactEmail && !/^[^@\s]+@[^@\s]+$/.test(contactEmail)) {
    problems.push("CONTACT_EMAIL must be empty or an email address");
  }
  const siteOperator = env.SITE_OPERATOR?.trim() || undefined;
  if (siteOperator && siteOperator.length > SITE_OPERATOR_MAX_LENGTH) {
    problems.push(
      `SITE_OPERATOR must be at most ${SITE_OPERATOR_MAX_LENGTH} characters`,
    );
  }
  return { contactEmail, siteOperator };
}

/**
 * A hostname as URL gives it, lowercased and without a trailing dot. URL
 * normalises http(s) hosts itself, but not those of postgres://, redis://,
 * or smtp:// addresses.
 */
function normalisedHostname(url: URL): string {
  return url.hostname.toLowerCase().replace(/\.$/, "");
}

/** Whether `hostname` (normalised) is this machine. */
export function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    // 127.0.0.0/8, also in shortened forms such as 127.1, which URL leaves
    // as written outside http(s).
    /^127(\.\d+){0,3}$/.test(hostname) ||
    hostname === "0.0.0.0" ||
    // URL keeps the brackets around an IPv6 address.
    hostname === "[::1]" ||
    hostname === "[0:0:0:0:0:0:0:1]"
  );
}

/** A private-network IPv4 address, such as a phone test over the LAN. */
function isPrivateNetworkAddress(hostname: string): boolean {
  const octets = hostname.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }
  const [a, b] = octets as [number, number, number, number];
  return (
    a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  );
}

function isQuickTunnelHostname(hostname: string): boolean {
  // One label before the domain, exactly as the tunnel hands it out.
  const [label, ...rest] = hostname.split(".");
  return Boolean(label) && rest.join(".") === QUICK_TUNNEL_DOMAIN;
}

/**
 * Adds a problem when `value`, the app's own public address (SITE_URL),
 * belongs to another environment:
 * - local: this machine, a private network address, or a quick tunnel for
 *   a demo;
 * - staging: HTTPS at a `dev.` host;
 * - production: HTTPS at any other public host.
 * Hosts are compared label by label, never by suffix, since staging's
 * address ends with production's. Nothing is checked for an unknown
 * environment or an unparsable value, which their own checks report.
 */
export function checkSiteAddress(
  environment: AppEnvironment | undefined,
  name: string,
  value: string,
  problems: string[],
): void {
  if (!environment || !URL.canParse(value)) return;
  const url = new URL(value);
  const hostname = normalisedHostname(url);
  const onThisMachine =
    isLoopbackHostname(hostname) || isPrivateNetworkAddress(hostname);
  const quickTunnel = isQuickTunnelHostname(hostname);

  if (environment === "local") {
    if (!onThisMachine && !quickTunnel) {
      problems.push(
        `${name} must be this machine (localhost or a private network address) or a quick-tunnel address (*.${QUICK_TUNNEL_DOMAIN}) when APP_ENV is local`,
      );
    }
    return;
  }
  if (url.protocol !== "https:" || onThisMachine || quickTunnel) {
    problems.push(
      `${name} must be a public https:// address when APP_ENV is ${environment}`,
    );
    return;
  }
  const staging = hostname.split(".")[0] === STAGING_LABEL;
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
 * database, Valkey, storage, or email, belongs to another environment:
 * - local: only this machine, or a container beside it, named by a single
 *   label as Compose names its services (`postgres`, `storage`) or as
 *   `host.docker.internal`; never a hosted service, so a laptop cannot
 *   reach staging's or production's data;
 * - staging and production: never this machine, and HTTPS for any http(s)
 *   service. An address that cannot be read as one host is refused, so a
 *   multi-host or host-in-the-query database URL cannot slip past.
 * Nothing is checked for an unknown environment or an unset value.
 */
export function checkServiceAddress(
  environment: AppEnvironment | undefined,
  name: string,
  value: string | undefined,
  problems: string[],
): void {
  if (!environment || !value) return;
  const url = URL.canParse(value) ? new URL(value) : undefined;
  const hostname = url ? normalisedHostname(url) : "";

  if (environment === "local") {
    if (
      url &&
      !isLoopbackHostname(hostname) &&
      !isPrivateNetworkAddress(hostname) &&
      hostname !== DOCKER_HOST_NAME &&
      hostname.includes(".")
    ) {
      problems.push(
        `${name} must be a service on this machine or in its containers when APP_ENV is local, never a hosted one`,
      );
    }
    return;
  }
  if (!url || !hostname || url.searchParams.has("host")) {
    problems.push(
      `${name} must be a URL with a single host when APP_ENV is ${environment}`,
    );
  } else if (isLoopbackHostname(hostname)) {
    problems.push(
      `${name} must not point at this machine (localhost) when APP_ENV is ${environment}`,
    );
  } else if (url.protocol === "http:") {
    problems.push(`${name} must use https:// when APP_ENV is ${environment}`);
  }
}
