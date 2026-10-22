import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { FONT_VARIABLES } from "@/fonts";

import "@/styles/tokens.css";
import "./admin.css";

export const metadata: Metadata = {
  title: "Admin - Country Topics",
  robots: { index: false, follow: false },
};

// The staff UI (ADR 0014), with its own root layout so that it loads none
// of the site's header, styles, or scripts, and the site none of its own.
// Each page checks the session itself (gate.ts): a layout is not rendered
// again on every navigation.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={FONT_VARIABLES}>
      <body>
        <header className="admin-header">
          <Link href="/admin" className="admin-name">
            Country Topics admin
          </Link>
          <Link href="/">View the site</Link>
        </header>
        <main id="main" className="admin-main">
          {children}
        </main>
      </body>
    </html>
  );
}
