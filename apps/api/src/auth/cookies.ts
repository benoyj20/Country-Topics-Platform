import { isLoopbackHostname } from "@countrytopics/environment";

/**
 * How the site's cookies are named (ADR 0014). Each starts with __Host-:
 * browsers accept such a cookie only when it is Secure, for the whole site
 * (Path=/), and names no Domain, so staging at dev.<domain>, same-site with
 * production, cannot plant a session production would read. Better Auth
 * adds __Secure- itself when its secure cookies are on, so they are turned
 * off and Secure is set on each cookie instead.
 *
 * Secure cookies need https, or http://localhost, which browsers treat as
 * secure. A local site on another http address, such as a phone test over
 * the network, gets plain names; no hosted site is ever plain http.
 */
export function cookieSettings(siteUrl: string): {
  prefix: string;
  secure: boolean;
} {
  const url = new URL(siteUrl);
  const secure =
    url.protocol === "https:" || isLoopbackHostname(url.hostname.toLowerCase());
  return secure
    ? { prefix: "__Host-countrytopics", secure: true }
    : { prefix: "countrytopics", secure: false };
}
