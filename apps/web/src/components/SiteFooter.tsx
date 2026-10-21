"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/Logo";

/**
 * Links at the bottom of every page. The feedback link names the page it
 * was opened from, so feedback says which page it is about (ADR 0011).
 */
export function SiteFooter() {
  const pathname = usePathname();
  const from =
    pathname && pathname !== "/feedback"
      ? `?from=${encodeURIComponent(pathname)}`
      : "";
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-about">
          <Link href="/" className="site-name">
            <Logo />
            Country Topics
          </Link>
          <p>
            Topics organised by country, each backed by video snippets,
            documents, and references you can check for yourself.
          </p>
        </div>
        <nav aria-label="About the site">
          <Link href="/topics">Browse topics</Link>
          <Link href={`/feedback${from}`}>Send feedback</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}
