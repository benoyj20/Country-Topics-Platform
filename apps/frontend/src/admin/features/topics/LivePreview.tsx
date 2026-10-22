"use client";

import { useEffect, useId, useState } from "react";

import { formatTime } from "@/format";

import "./topics.css";

// The topic editor's live preview (ADR 0014, phase 11), as Payload's panel
// shows one beside the form: the topic page from its newest draft, in the
// site's own layout (app/(site)/preview), at a desktop's, a tablet's, or a
// phone's width. It reloads after each save, autosaves included.

const WIDTHS = [
  { id: "desktop", label: "Desktop", px: null },
  { id: "tablet", label: "Tablet", px: 768 },
  { id: "phone", label: "Phone", px: 390 },
] as const;
type Width = (typeof WIDTHS)[number]["id"];

export function LivePreview({
  id,
  savedAt,
  dirty,
  onClose,
}: {
  id: string;
  /** When the draft shown was saved; a new save reloads the preview. */
  savedAt: string;
  /** The form has changes the draft does not have yet. */
  dirty: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const [width, setWidth] = useState<Width>("desktop");
  const px = WIDTHS.find((option) => option.id === width)?.px ?? null;
  // The save's time keeps the address new, so the frame loads it again.
  const src = `/preview/topics/${encodeURIComponent(id)}?saved=${encodeURIComponent(savedAt)}`;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <section className="live-preview" aria-labelledby={titleId}>
      <div className="live-preview-bar">
        <h2 id={titleId}>Live preview</h2>
        <fieldset className="live-preview-widths">
          <legend className="admin-visually-hidden">Width</legend>
          {WIDTHS.map((option) => (
            <label key={option.id} className="admin-check">
              <input
                type="radio"
                name={`${titleId}-width`}
                checked={width === option.id}
                onChange={() => setWidth(option.id)}
              />
              {option.label}
            </label>
          ))}
        </fieldset>
        <div className="admin-actions">
          <a href={src} target="_blank" rel="noreferrer">
            Open in a new tab
          </a>
          <button
            type="button"
            className="admin-button secondary"
            onClick={onClose}
          >
            Close preview
          </button>
        </div>
      </div>
      <p className="admin-muted" role="status">
        The draft saved at {formatTime(savedAt)}.
        {dirty ? " Your newest changes appear once they are autosaved." : ""}
      </p>
      <div className="live-preview-frame">
        <iframe
          key={src}
          src={src}
          title="The topic page as visitors will see it"
          style={px ? { width: `${px}px` } : undefined}
        />
      </div>
    </section>
  );
}
