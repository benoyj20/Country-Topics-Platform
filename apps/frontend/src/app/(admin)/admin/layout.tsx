import type { Metadata } from "next";
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
// Each page checks the session itself (gate.ts) and draws its own frame
// (AdminShell): a layout is not rendered again on every navigation.
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={FONT_VARIABLES}>
      <body>{children}</body>
    </html>
  );
}
