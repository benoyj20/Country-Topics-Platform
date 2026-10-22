"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * On narrow screens, shows or hides the navigation (AdminShell). Without
 * scripts the navigation stays open, above the page.
 */
export function NavToggle() {
  const pathname = usePathname();
  // Open only on the page it was opened on, so a new page starts closed.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  useEffect(() => {
    document.documentElement.toggleAttribute("data-admin-nav-closed", !open);
    return () =>
      document.documentElement.removeAttribute("data-admin-nav-closed");
  }, [open]);

  return (
    <button
      type="button"
      className="admin-button secondary admin-nav-toggle"
      aria-controls="admin-nav"
      aria-expanded={open}
      onClick={() => setOpenOn(open ? null : pathname)}
    >
      Menu
    </button>
  );
}
