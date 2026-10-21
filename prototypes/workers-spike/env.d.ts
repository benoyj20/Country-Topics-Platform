// The Worker's settings (wrangler.jsonc's vars and bindings).
interface CloudflareEnv {
  SITE_URL: string;
  BACKEND_URL: string;
  PAYLOAD_URL: string;
  PAYLOAD_ORIGIN: string;
  PURGE_KEY: string;
  SENTRY_DSN?: string;
}
