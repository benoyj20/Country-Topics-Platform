import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { SiteShell } from "@/components/SiteShell";
import { FONT_VARIABLES } from "@/fonts";

import "@/styles/tokens.css";
import "./styles.css";

export const metadata: Metadata = {
  title: "Country Topics",
  description:
    "Country-organised topics backed by video snippets, transcripts, and references.",
  // The pilot is invite-only and names real people, so search engines must not index it.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#121a28" },
  ],
};

// The public pages and the member pages (ADR 0014). The admin has its own
// root layout, app/(admin), so neither loads the other's styles or scripts.
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={FONT_VARIABLES}>
      <SiteShell>{children}</SiteShell>
    </html>
  );
}
