// The Worker's settings (wrangler.jsonc's vars and bindings).
interface CloudflareEnv {
  BACKEND_URL: string;
  PURGE_KEY: string;
  SENTRY_DSN?: string;
}
