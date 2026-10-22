import {
  type AppEnvironment,
  checkServiceAddress,
  checkSiteAddress,
  readAppEnvironment,
  readBackendUrl,
  readLegalContacts,
  readSecret,
  readSiteUrl,
} from "@countrytopics/environment";

// The frontend's configuration, from environment variables only (Workers'
// vars and secrets when deployed, the repository's .env locally). Errors
// name the variable, never its value.

export type FrontendSettings = {
  environment: AppEnvironment;
  /** The site's public origin: this frontend's own address. */
  siteUrl: string;
  /** The backend's origin, which every passed-on request goes to. */
  backendUrl: string;
  /** The key every passed-on request is signed with. */
  forwardingKey: string;
  /** How to reach whoever runs the site, for the legal pages; optional. */
  contactEmail?: string;
  /** Who runs the site, as the legal pages name them; optional. */
  siteOperator?: string;
};

type Env = Record<string, string | undefined>;

export function readFrontendSettings(env: Env): FrontendSettings {
  const problems: string[] = [];
  const environment = readAppEnvironment(env, problems);
  const siteUrl = readSiteUrl(env, problems);
  const backendUrl = readBackendUrl(env, siteUrl, problems);
  const forwardingKey = readSecret(env, "FORWARDING_KEY", problems);
  const { contactEmail, siteOperator } = readLegalContacts(env, problems);
  checkSiteAddress(environment, "SITE_URL", siteUrl, problems);
  checkServiceAddress(environment, "BACKEND_URL", backendUrl, problems);
  if (problems.length > 0 || !environment) {
    throw new Error(
      `Invalid frontend configuration:\n- ${problems.join("\n- ")}`,
    );
  }
  return {
    environment,
    siteUrl,
    backendUrl,
    forwardingKey,
    contactEmail,
    siteOperator,
  };
}

let cached: FrontendSettings | undefined;

/** The validated configuration for this process, read once. */
export function frontendSettings(): FrontendSettings {
  cached ??= readFrontendSettings(process.env);
  return cached;
}
