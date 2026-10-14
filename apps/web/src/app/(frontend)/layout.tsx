import type { Metadata } from "next";
import type { ReactNode } from "react";

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
        <main>{children}</main>
      </body>
    </html>
  );
}
