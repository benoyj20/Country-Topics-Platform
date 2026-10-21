import type { ReactNode } from "react";

// The frontend renders no pages of its own until phase 5 (ADR 0014); Next.js
// still wants a root layout for its built-in error pages.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
