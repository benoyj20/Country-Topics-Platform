"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

/**
 * A header link that is marked as the current page on its own page and
 * the pages under it, so readers can see where they are.
 */
export function NavLink({
  href,
  ...props
}: ComponentProps<typeof Link> & { href: string }) {
  const pathname = usePathname();
  const current =
    pathname !== null && (pathname === href || pathname.startsWith(`${href}/`));
  return (
    <Link href={href} aria-current={current ? "page" : undefined} {...props} />
  );
}
