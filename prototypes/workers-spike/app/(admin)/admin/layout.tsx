import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./admin.css";

// The admin's root layout, apart from the site's ((site)/layout.tsx), so
// visitors to the public pages load none of the admin's styles or scripts
// (ADR 0014, "The admin"). Every admin page reads the staff member's cookie,
// so each is rendered per request and never cached.

export const metadata: Metadata = {
  title: "Admin (spike)",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="admin-header">
          <a href="/admin">Country Topics admin</a>
          <span className="muted">ADR 0014 phase 2 spike</span>
        </header>
        <main className="admin-main">{children}</main>
      </body>
    </html>
  );
}
