import "@fontsource-variable/inter";
import "@fontsource-variable/source-serif-4";

import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { AccountLink } from "@/components/AccountLink";
import { ErrorReporting } from "@/components/ErrorReporting";
import { Logo } from "@/components/Logo";
import { NavLink } from "@/components/NavLink";
import { NotificationsLink } from "@/components/NotificationsLink";
import { SiteFooter } from "@/components/SiteFooter";

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

export default function FrontendLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <header className="site-header">
          <nav aria-label="Site">
            <Link href="/" className="site-name">
              <Logo id="header" />
              <span className="site-name-text">Country Topics</span>
              <span className="pilot">Pilot</span>
            </Link>
            <div className="site-links">
              <NavLink href="/topics">Topics</NavLink>
              <NotificationsLink />
              <AccountLink />
            </div>
          </nav>
        </header>
        <main id="main">{children}</main>
        <SiteFooter />
        <ErrorReporting />
      </body>
    </html>
  );
}
