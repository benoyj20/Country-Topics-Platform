import { getPayload, type Payload } from "payload";

/**
 * The Payload instance, for code that Payload's own config imports (auth hooks).
 * The config is imported lazily to break that import cycle.
 */
export async function loadPayload(): Promise<Payload> {
  const { default: config } = await import("@payload-config");
  return getPayload({ config });
}
