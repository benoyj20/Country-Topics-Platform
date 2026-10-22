"use client";

import {
  type DuplicateQuery,
  type PossibleDuplicate,
  possibleDuplicatesSchema,
  possibleDuplicatesSearchParams,
} from "@countrytopics/contracts";
import { useEffect, useState } from "react";

import { CheckField } from "../components/Field";
import type { FieldProps } from "../field-text";

/** How long typing a name pauses before the duplicates are looked up. */
const LOOKUP_DELAY_MS = 400;

const MATCH_LABELS: Record<PossibleDuplicate["matchedOn"], string> = {
  wikidata: "same Wikidata ID",
  name: "same name",
  alias: "same name as an alias",
  "similar name": "similar name",
};

type Lookup =
  { kind: "found"; matches: PossibleDuplicate[] } | { kind: "failed" };

/**
 * The duplicate warning (F2): as a name, aliases, or a Wikidata ID are
 * typed, the individuals who may be the same person, by the rules the
 * backend's save check uses. When a name or alias being added is exactly
 * another individual's, the box must be ticked before the backend saves.
 */
export function PossibleDuplicates({
  query,
  field,
  checked,
  readOnly,
  onChange,
}: {
  query: DuplicateQuery;
  /** The `notADuplicate` box. */
  field: FieldProps;
  checked: boolean;
  readOnly: boolean;
  onChange: (checked: boolean) => void;
}) {
  const params = possibleDuplicatesSearchParams(query).toString();
  // Nothing typed yet: nobody to compare.
  const empty =
    !query.name.trim() &&
    query.aliases.every((alias) => !alias.trim()) &&
    !query.wikidataId.trim();
  // Kept with the query it answers, so a result never shows for another.
  const [result, setResult] = useState<{
    params: string;
    lookup: Lookup;
  } | null>(null);

  useEffect(() => {
    if (empty) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/individuals/possible-duplicates?${params}`,
          { credentials: "same-origin", signal: controller.signal },
        );
        if (!response.ok) throw new Error(`${response.status}`);
        const { matches } = possibleDuplicatesSchema.parse(
          await response.json(),
        );
        setResult({ params, lookup: { kind: "found", matches } });
      } catch {
        if (!controller.signal.aborted) {
          setResult({ params, lookup: { kind: "failed" } });
        }
      }
    }, LOOKUP_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [params, empty]);

  const lookup = !empty && result?.params === params ? result.lookup : null;
  const matches = lookup?.kind === "found" ? lookup.matches : [];
  const needsConfirmation = matches.some((match) => match.needsConfirmation);
  // Offered whenever the backend may refuse the save for a duplicate.
  const offerBox =
    !readOnly &&
    (needsConfirmation ||
      lookup?.kind === "failed" ||
      Boolean(field.messages?.length) ||
      checked);
  if (matches.length === 0 && !offerBox) return null;

  return (
    <div className="admin-field" aria-live="polite">
      {lookup?.kind === "failed" && (
        <p className="admin-notice">
          Could not check for possible duplicates. The backend still checks for
          the same name when you save.
        </p>
      )}
      {matches.length > 0 && (
        <div
          className={needsConfirmation ? "admin-notice error" : "admin-notice"}
        >
          <p>
            <strong>Possible duplicates.</strong> Check these before saving:
          </p>
          <ul>
            {matches.map((match) => (
              <li key={match.id}>
                <a
                  href={`/admin/collections/individuals/${encodeURIComponent(match.id)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {match.name}
                </a>
                {match.summary ? `, ${match.summary}` : ""} (
                {MATCH_LABELS[match.matchedOn]})
              </li>
            ))}
          </ul>
        </div>
      )}
      {offerBox && (
        <CheckField {...field} checked={checked} onChange={onChange} />
      )}
    </div>
  );
}
