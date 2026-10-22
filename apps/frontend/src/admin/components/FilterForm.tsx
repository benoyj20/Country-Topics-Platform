"use client";

import { usePathname, useRouter } from "next/navigation";
import type { FormEvent, ReactNode } from "react";

/**
 * A list's filters: on submit, the list's address with only the filters
 * that have a value, so the address stays readable. Without scripts it is
 * a plain form, and empty filters are ignored when read.
 */
export function FilterForm({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    for (const [name, value] of new FormData(event.currentTarget)) {
      if (typeof value === "string" && value.trim()) {
        params.append(name, value.trim());
      }
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <form method="get" className={className} onSubmit={submit}>
      {children}
    </form>
  );
}
