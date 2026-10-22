import type { VersionRow } from "@countrytopics/contracts";

import { formatDateTime } from "@/format";

import type { ComparedVersions } from "../registry/versions";
import { ComparisonLoader } from "./ComparisonLoader";

/** A version as a comparison names it. */
export type NamedVersion = {
  id: string;
  updatedAt: string;
  /** "Published", "Draft", or nothing for collections without drafts. */
  status?: string | null;
};

function versionName(version: NamedVersion): string {
  return `${formatDateTime(version.updatedAt)}${version.status ? ` (${version.status})` : ""}`;
}

/**
 * A version compared with another of the same record, as Payload's panel
 * shows a version: by default with the one saved before it, or with any
 * of the record's newest versions chosen here.
 */
export function VersionCompare({
  shown,
  other,
  choices,
  compared,
}: {
  /** The version this page is about. */
  shown: NamedVersion;
  /** The version it is compared with; null when it is the only one. */
  other: NamedVersion | null;
  /** What it can be compared with, newest first. */
  choices: readonly VersionRow[];
  /**
   * The two versions' values, the earlier first: `shownFirst` when this
   * page's version is the earlier one.
   */
  compared: (shownFirst: boolean) => ComparedVersions;
}) {
  const options = choices.filter((choice) => choice.id !== shown.id);
  // A version older than those offered stays chosen.
  if (other && !options.some((choice) => choice.id === other.id)) {
    options.push({
      id: other.id,
      createdAt: other.updatedAt,
      updatedAt: other.updatedAt,
      version: {},
    });
  }
  const shownFirst = other !== null && other.updatedAt > shown.updatedAt;
  const [before, after] = shownFirst ? [shown, other] : [other, shown];
  return (
    <section className="admin-stack" aria-label="Comparison">
      {options.length > 0 && (
        <form method="get" className="admin-compare-form">
          <label htmlFor="compare">Compare with the version saved</label>
          <select
            id="compare"
            name="compare"
            className="admin-input"
            defaultValue={other?.id ?? ""}
          >
            {!other && <option value="">Choose a version</option>}
            {options.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {formatDateTime(choice.updatedAt)}
                {choice.version._status === "published"
                  ? " (Published)"
                  : choice.version._status === "draft"
                    ? " (Draft)"
                    : ""}
              </option>
            ))}
          </select>
          <button type="submit" className="admin-button secondary">
            Compare
          </button>
        </form>
      )}
      {before && after ? (
        <ComparisonLoader
          versions={compared(shownFirst)}
          beforeLabel={`${versionName(before)}${before.id === shown.id ? ", this version" : ""}`}
          afterLabel={`${versionName(after)}${after.id === shown.id ? ", this version" : ""}`}
        />
      ) : (
        <p className="admin-notice">
          This is the only version saved: there is nothing to compare it with.
        </p>
      )}
    </section>
  );
}
