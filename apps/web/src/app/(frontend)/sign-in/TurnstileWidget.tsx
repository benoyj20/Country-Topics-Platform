"use client";

import { useEffect, useRef } from "react";

// Cloudflare Turnstile's widget (ADR 0010), loaded only on the sign-in
// page and only when the site has Turnstile keys. Its token goes with the
// request for an email link, which Better Auth checks with Cloudflare.

const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render(
    element: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | undefined;

function loadTurnstile(): Promise<TurnstileApi> {
  loading ??= new Promise((resolve, reject) => {
    if (window.turnstile) {
      resolve(window.turnstile);
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () =>
      window.turnstile
        ? resolve(window.turnstile)
        : reject(new Error("Turnstile did not start."));
    script.onerror = () => {
      loading = undefined;
      reject(new Error("Turnstile could not be loaded."));
    };
    document.head.append(script);
  });
  return loading;
}

/**
 * Shows the widget and reports its token, or null when there is none (not
 * yet, expired, or failed). A new `resetKey` asks for a fresh token: each
 * one works once.
 */
export function TurnstileWidget({
  siteKey,
  resetKey,
  onToken,
  onUnavailable,
}: {
  siteKey: string;
  resetKey: number;
  onToken: (token: string | null) => void;
  onUnavailable: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<{ api: TurnstileApi; id: string } | null>(null);
  // The latest callbacks, without rendering the widget again.
  const callbacks = useRef({ onToken, onUnavailable });
  useEffect(() => {
    callbacks.current = { onToken, onUnavailable };
  });

  useEffect(() => {
    let cancelled = false;
    loadTurnstile().then(
      (api) => {
        if (cancelled || !container.current) return;
        const id = api.render(container.current, {
          sitekey: siteKey,
          action: "sign-in",
          callback: (token) => callbacks.current.onToken(token),
          "expired-callback": () => callbacks.current.onToken(null),
          "error-callback": () => callbacks.current.onToken(null),
        });
        widget.current = { api, id };
      },
      () => {
        if (!cancelled) callbacks.current.onUnavailable();
      },
    );
    return () => {
      cancelled = true;
      if (widget.current) widget.current.api.remove(widget.current.id);
      widget.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (resetKey === 0 || !widget.current) return;
    callbacks.current.onToken(null);
    widget.current.api.reset(widget.current.id);
  }, [resetKey]);

  return <div ref={container} />;
}
