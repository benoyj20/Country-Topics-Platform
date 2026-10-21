import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import type { ReactNode } from "react";

import "./styles.css";

// The site's root layout, with its fonts and styles (apps/web), to see that
// next/font's files are served from the Worker's static assets. The admin
// has its own root layout ((admin)/admin/layout.tsx), so neither loads the
// other's styles or scripts (ADR 0014).
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
  title: "Workers spike",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>
        <main id="main" className="container">
          {children}
        </main>
      </body>
    </html>
  );
}
