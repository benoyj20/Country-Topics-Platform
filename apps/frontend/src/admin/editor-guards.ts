"use client";

import {
  type RefObject,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

// What every editor does around its form, as Payload's panel does: asks
// before leaving unsaved changes, and saves on Ctrl+S.

/** While `dirty`, the browser asks before leaving, and so do the admin's links. */
export function useLeaveGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    const onClick = (event: MouseEvent) => {
      const link =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === "_blank" ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey
      ) {
        return;
      }
      const to = new URL(link.href);
      const here = window.location;
      // Another site, or a field on this page, such as a message's link.
      if (
        to.origin !== here.origin ||
        (to.hash && to.pathname === here.pathname && to.search === here.search)
      ) {
        return;
      }
      if (!window.confirm("Leave without saving? Your changes will be lost.")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);
}

/**
 * Ctrl+S (or ⌘S) calls `save` while `enabled`. While a dialog is open,
 * only the form inside it (`form`) saves: a record made from a field's
 * dialog, not the editor behind it.
 */
export function useSaveShortcut(
  save: () => void,
  enabled: boolean,
  form?: RefObject<HTMLElement | null>,
): void {
  const onSave = useEffectEvent(save);
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        // The dialog opened last is on top: a dialog can open another.
        const dialog = [...document.querySelectorAll("dialog[open]")].at(-1);
        if (dialog && !(form?.current && dialog.contains(form.current))) {
          return;
        }
        onSave();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, form]);
}

/**
 * A refused write's messages take the focus once they are drawn: `refused`
 * is called with each refusal. A timer could run before React draws them.
 */
export function useRefusalFocus(): [
  summaryRef: RefObject<HTMLDivElement | null>,
  refused: () => void,
] {
  const summaryRef = useRef<HTMLDivElement>(null);
  const [refusals, setRefusals] = useState(0);
  useEffect(() => {
    if (refusals > 0) summaryRef.current?.focus();
  }, [refusals]);
  return [summaryRef, () => setRefusals((count) => count + 1)];
}

/**
 * Takes the one-time `?saved=…` notice out of the address, so a reload
 * does not show it again.
 */
export function useArrivedNotice(notice: string | undefined): void {
  useEffect(() => {
    if (notice) window.history.replaceState(null, "", window.location.pathname);
  }, [notice]);
}
