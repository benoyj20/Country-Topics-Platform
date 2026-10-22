"use client";

import { usePathname, useRouter } from "next/navigation";
import { type FormEvent, useEffect, useRef, useState } from "react";

/** How long typing pauses before the list follows, as in Payload's panel. */
const SEARCH_DELAY_MS = 300;

/**
 * A list's search: it follows the typing after a short pause, or at once
 * on Enter, keeping the list's filters, sort, and page size. Without
 * scripts it is a plain form.
 */
export function SearchBox({
  placeholder,
  value,
  kept,
}: {
  placeholder: string;
  /** The search in the list's address. */
  value: string;
  /** The list's other parameters, kept as they are. */
  kept: Record<string, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [text, setText] = useState(value);
  const [shown, setShown] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // The address changed some other way (a link, Back): show its search.
  // While typing, the address follows the box, trimmed, so that is no change.
  if (value !== shown) {
    setShown(value);
    if (value !== text.trim()) setText(value);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  function go(next: string) {
    clearTimeout(timer.current);
    const params = new URLSearchParams(kept);
    if (next.trim()) params.set("search", next.trim());
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  function follow(next: string) {
    setText(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => go(next), SEARCH_DELAY_MS);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    go(text);
  }

  return (
    <form role="search" className="admin-search" method="get" onSubmit={submit}>
      {Object.entries(kept).map(([name, kept]) => (
        <input key={name} type="hidden" name={name} value={kept} />
      ))}
      <label htmlFor="admin-search" className="admin-visually-hidden">
        Search
      </label>
      <input
        id="admin-search"
        className="admin-input"
        type="search"
        name="search"
        autoComplete="off"
        placeholder={placeholder}
        value={text}
        onChange={(event) => follow(event.target.value)}
      />
    </form>
  );
}
