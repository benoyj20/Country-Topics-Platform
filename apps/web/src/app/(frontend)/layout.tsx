import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import type { ReactNode } from "react";

import { AccountLink } from "@/components/AccountLink";
import { ErrorReporting } from "@/components/ErrorReporting";
import { Logo } from "@/components/Logo";
import { NavLink } from "@/components/NavLink";
import { NotificationsLink } from "@/components/NotificationsLink";
import { SiteFooter } from "@/components/SiteFooter";

import "./styles.css";

// Downloaded when the site is built and served from the site itself, so
// visitors' browsers never contact Google. Text in other scripts falls back
// to the system fonts in styles.css.
const sans = Inter({
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
  display: "swap",
});
const serif = Source_Serif_4({
  subsets: ["latin", "latin-ext"],
  style: ["normal", "italic"],
  variable: "--font-source-serif",
  display: "swap",
});

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

// The site's pages are served by apps/frontend since ADR 0014's phase 5;
// these copies no longer reach visitors and are removed in phase 12.
// Change the pages there. The API routes in this group stay.
export default function FrontendLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <header className="site-header">
          <nav aria-label="Site">
            <Link href="/" className="site-name">
              <Logo />
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
