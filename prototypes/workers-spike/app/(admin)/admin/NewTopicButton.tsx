"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { savedTopic } from "./topic-data";

/** Creates a TEST draft topic through Payload's REST API, then opens it. */
export function NewTopicButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      let response: Response;
      try {
        response = await fetch("/api/topics?draft=true&depth=0", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: `TEST admin spike topic ${new Date().toISOString()}`,
            summary:
              "TEST content made in the admin spike. It is not a real topic.",
            _status: "draft",
          }),
        });
      } catch {
        setError("The backend could not be reached.");
        return;
      }
      const topic = savedTopic(await response.json().catch(() => null));
      if (!response.ok || !topic) {
        setError(`The backend refused the new topic (${response.status}).`);
        return;
      }
      router.push(`/admin/topics/${topic.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="primary"
        disabled={busy}
        onClick={() => void create()}
      >
        New TEST topic
      </button>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
