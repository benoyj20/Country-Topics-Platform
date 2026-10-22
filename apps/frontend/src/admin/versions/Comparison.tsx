"use client";

import { useId, useMemo, useState } from "react";

import { type ComparedVersions, comparedFields } from "./compared-fields";
import { type DiffPart, side, textDiff } from "./diff";

// Two versions side by side (ADR 0014, phase 11), as Payload's panel
// compares them: each field that differs, with the words removed marked in
// the earlier version and those added in the later one. Loaded in the
// browser only (ComparisonLoader), so the Worker carries none of it.

function Side({ parts }: { parts: DiffPart[] }) {
  if (parts.length === 0) return <span className="admin-none">None</span>;
  return (
    <div className="admin-diff">
      {parts.map((part, index) =>
        part.kind === "same" ? (
          <span key={index}>{part.text}</span>
        ) : part.kind === "removed" ? (
          <del key={index}>
            <span className="admin-visually-hidden">Removed: </span>
            {part.text}
          </del>
        ) : (
          <ins key={index}>
            <span className="admin-visually-hidden">Added: </span>
            {part.text}
          </ins>
        ),
      )}
    </div>
  );
}

export default function Comparison({
  versions,
  beforeLabel,
  afterLabel,
}: {
  versions: ComparedVersions;
  /** What the earlier version is called, such as its date. */
  beforeLabel: string;
  afterLabel: string;
}) {
  const id = useId();
  const [all, setAll] = useState(false);
  const fields = useMemo(() => comparedFields(versions), [versions]);
  const changed = fields.filter((field) => field.before !== field.after);
  const shown = all ? fields : changed;
  return (
    <section className="admin-stack" aria-labelledby={`${id}-title`}>
      <div className="admin-title-row">
        <h2 id={`${id}-title`}>Changes</h2>
        <label className="admin-check">
          <input
            type="checkbox"
            checked={all}
            onChange={(event) => setAll(event.target.checked)}
          />
          Show unchanged fields
        </label>
      </div>
      <p className="admin-muted">
        {changed.length === 0
          ? "Nothing differs between these versions."
          : `${changed.length} of ${fields.length} fields differ. Removed words are struck through in the earlier version; added words are underlined in the later one.`}
      </p>
      {shown.length > 0 && (
        <div
          className="admin-table-wrap"
          role="region"
          aria-label="The fields compared"
          tabIndex={0}
        >
          <table className="admin-table admin-compare">
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">{beforeLabel}</th>
                <th scope="col">{afterLabel}</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((field) => {
                const parts = textDiff(field.before, field.after);
                return (
                  <tr
                    key={field.key}
                    className={
                      field.before === field.after ? undefined : "changed"
                    }
                  >
                    <th scope="row">{field.label}</th>
                    {/* Narrow screens stack the two, each named. */}
                    <td data-version={beforeLabel}>
                      <Side parts={side(parts, "before")} />
                    </td>
                    <td data-version={afterLabel}>
                      <Side parts={side(parts, "after")} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
