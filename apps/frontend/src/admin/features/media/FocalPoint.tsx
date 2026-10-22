"use client";

import { focalCoordinate } from "@countrytopics/contracts";
import { type KeyboardEvent, type MouseEvent, useEffect, useMemo } from "react";

import "./media.css";

// An image's focal point (ADR 0014, phase 11), as Payload's panel sets it:
// where the image's subject is, which a cropped copy keeps in view, such
// as an individual's round profile photo on the site. Set by clicking the
// image, or with the arrow keys.

/** Addresses about to be given up, which a component shown again keeps. */
const revoking = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * A chosen file's address in this browser, given up once nothing shows
 * it. Giving it up waits a moment: React's development mode takes an
 * effect down and up again at once, and the address must outlive that.
 */
export function useObjectUrl(file: File | null): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    if (!url) return;
    clearTimeout(revoking.get(url));
    revoking.delete(url);
    return () => {
      revoking.set(
        url,
        setTimeout(() => {
          revoking.delete(url);
          URL.revokeObjectURL(url);
        }, 0),
      );
    };
  }, [url]);
  return url;
}

const STEP = 1;
const BIG_STEP = 10;

export function FocalPoint({
  id,
  src,
  x,
  y,
  onChange,
  disabled = false,
  describedBy,
}: {
  /** The image button's id, which the field's label points at. */
  id: string;
  src: string;
  /** In percent from the left and top; null until set. */
  x: number | null;
  y: number | null;
  onChange: (x: number | null, y: number | null) => void;
  disabled?: boolean;
  describedBy?: string;
}) {
  // An image with no focal point keeps its middle.
  const shownX = x ?? 50;
  const shownY = y ?? 50;

  function pick(event: MouseEvent<HTMLButtonElement>) {
    // A click from the keyboard (Enter or Space) has no position.
    if (event.detail === 0) return;
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    onChange(
      focalCoordinate(((event.clientX - box.left) / box.width) * 100),
      focalCoordinate(((event.clientY - box.top) / box.height) * 100),
    );
  }

  function move(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? BIG_STEP : STEP;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const by = moves[event.key];
    if (!by) return;
    event.preventDefault();
    onChange(focalCoordinate(shownX + by[0]), focalCoordinate(shownY + by[1]));
  }

  return (
    <div className="admin-focal">
      <button
        type="button"
        id={id}
        className="admin-focal-image"
        disabled={disabled}
        aria-describedby={describedBy}
        aria-label={`Focal point, ${shownX}% across and ${shownY}% down. Click where the subject is, or move it with the arrow keys; Shift moves it further.`}
        onClick={pick}
        onKeyDown={move}
      >
        {/* A file in this browser, or one the backend serves to staff
            only: next/image would fetch neither. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" />
        <span
          className="admin-focal-mark"
          style={{ left: `${shownX}%`, top: `${shownY}%` }}
          aria-hidden="true"
        />
      </button>
      <p className="admin-muted">
        {x === null || y === null
          ? "Not set: a cropped copy keeps the middle of the image."
          : `${x}% across, ${y}% down.`}{" "}
        {x !== null && !disabled && (
          <button
            type="button"
            className="admin-link-button"
            onClick={() => onChange(null, null)}
          >
            Clear the focal point
          </button>
        )}
      </p>
    </div>
  );
}
