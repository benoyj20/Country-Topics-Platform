import type { Metadata } from "next";

import { PageNotFound } from "@/components/PageNotFound";
import { SiteShell } from "@/components/SiteShell";
import { FONT_VARIABLES } from "@/fonts";

import "@/styles/tokens.css";
import "./(site)/styles.css";

export const metadata: Metadata = {
  title: "Page not found - Country Topics",
  robots: { index: false, follow: false },
};

// An address that matches no route (ADR 0014). The site and the admin have
// separate root layouts, so Next.js has none to put its own 404 in; this
// one looks like the site's.
export default function GlobalNotFound() {
  return (
    <html lang="en" className={FONT_VARIABLES}>
      <SiteShell>
        <PageNotFound />
      </SiteShell>
    </html>
  );
}
