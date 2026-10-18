"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
      <nav aria-label="About the site">
        <Link href={`/feedback${from}`}>Send feedback</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
      </nav>
    </footer>
  );
}
