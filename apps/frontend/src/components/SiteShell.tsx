import Link from "next/link";
import type { ReactNode } from "react";

import { AccountLink } from "@/components/AccountLink";
import { ErrorReporting } from "@/components/ErrorReporting";
import { Logo } from "@/components/Logo";
import { NavLink } from "@/components/NavLink";
import { NotificationsLink } from "@/components/NotificationsLink";
import { SiteFooter } from "@/components/SiteFooter";

/**
 * The site's page around its content: the header, the footer, and error
 * reporting. Used by the site's layout and by the 404 for addresses no
 * route matches (app/global-not-found.tsx).
 */
export function SiteShell({ children }: { children: ReactNode }) {
  return (
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
  );
}
