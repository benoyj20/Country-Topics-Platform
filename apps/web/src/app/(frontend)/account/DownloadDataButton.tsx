"use client";

import { useState } from "react";

const EXPORT_URL = "/api/v1/account/export";
const FALLBACK_NAME = "country-topics-data.json";

/**
 * Downloads the member's data (ADR 0011). Fetched rather than linked, so
 * a refusal (such as too many downloads today) shows its message instead
 * of being saved as the file.
 */
export function DownloadDataButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(EXPORT_URL, { credentials: "same-origin" });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        setError(
          body &&
            typeof body === "object" &&
            "error" in body &&
            typeof body.error === "string"
            ? body.error
            : "Your data could not be downloaded.",
        );
        return;
      }
      const name =
        /filename="([^"]+)"/.exec(
          response.headers.get("content-disposition") ?? "",
        )?.[1] ?? FALLBACK_NAME;
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Your data could not be downloaded. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div>
        <button
          type="button"
          className="button secondary"
          onClick={download}
          disabled={busy}
        >
          {busy ? "Preparing…" : "Download your data"}
        </button>
      </div>
      {error ? (
        <p className="notice error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
