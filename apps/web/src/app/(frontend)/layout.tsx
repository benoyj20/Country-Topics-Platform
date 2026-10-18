import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { AccountLink } from "@/components/AccountLink";
import { ErrorReporting } from "@/components/ErrorReporting";
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

export default function FrontendLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <nav aria-label="Site">
            <Link href="/" className="site-name">
              Country Topics
            </Link>
            <div className="site-links">
              <Link href="/topics">Topics</Link>
              <NotificationsLink />
              <AccountLink />
            </div>
          </nav>
        </header>
        <main>{children}</main>
        <SiteFooter />
        <ErrorReporting />
      </body>
    </html>
  );
}
