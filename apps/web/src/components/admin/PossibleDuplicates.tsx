"use client";

import {
  Banner,
  CheckboxInput,
  useConfig,
  useDocumentInfo,
  useField,
  useFormFields,
} from "@payloadcms/ui";
import type { CheckboxFieldClientComponent } from "payload";
import { isWikidataId } from "@countrytopics/domain";
import { useEffect, useState } from "react";

import type { PossibleDuplicate } from "@/individuals/duplicates";
import { DIFFERENT_PERSON_LABEL } from "@/individuals/labels";

const LOOKUP_DELAY_MS = 400;

const MATCH_LABELS: Record<PossibleDuplicate["matchedOn"], string> = {
  wikidata: "same Wikidata ID",
  name: "same name",
  alias: "same name as an alias",
  "similar name": "similar name",
};

/**
 * The duplicate warning (F2): as the admin types a name, aliases, or a
 * Wikidata ID, lists individuals who may be the same person. When the server
 * says a match needs confirmation (a name or alias being added is exactly
 * another individual's), the checkbox must be ticked before it saves.
 */
export const PossibleDuplicates: CheckboxFieldClientComponent = ({
  path,
  field,
}) => {
  const { value, setValue } = useField<boolean>({ path });
  const { id } = useDocumentInfo();
  const { config } = useConfig();
  const name = useFormFields(([fields]) => fields.name?.value);
  const wikidataId = useFormFields(([fields]) => fields.wikidataId?.value);
  // Joined into one string so the selector's result compares by value.
  const aliases = useFormFields(([fields]) =>
    Object.entries(fields)
      .filter(([fieldPath]) => /^aliases\.\d+\.name$/.test(fieldPath))
      .map(([, state]) => (typeof state.value === "string" ? state.value : ""))
      .join("\n"),
  );
  const [matches, setMatches] = useState<PossibleDuplicate[]>([]);
  const [lookupFailed, setLookupFailed] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (typeof name === "string") params.set("name", name);
    for (const alias of aliases.split("\n")) {
      if (alias.trim()) params.append("alias", alias);
    }
    if (typeof wikidataId === "string" && isWikidataId(wikidataId))
      params.set("wikidataId", wikidataId);
    if (id) params.set("exclude", String(id));

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `${config.serverURL}${config.routes.api}/individuals/possible-duplicates?${params}`,
          { credentials: "same-origin", signal: controller.signal },
        );
        if (!response.ok) throw new Error(`Lookup failed: ${response.status}`);
        const body = (await response.json()) as {
          matches: PossibleDuplicate[];
        };
        setMatches(body.matches);
        setLookupFailed(false);
      } catch (error) {
        // A newer lookup replaced this one.
        if (controller.signal.aborted) return;
        // Stale matches would describe another name; say the check failed.
        console.error(error);
        setMatches([]);
        setLookupFailed(true);
      }
    }, LOOKUP_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [name, aliases, wikidataId, id, config.serverURL, config.routes.api]);

  const confirmation = (
    <CheckboxInput
      id={`field-${path}`}
      name={path}
      checked={value === true}
      label={
        typeof field.label === "string" ? field.label : DIFFERENT_PERSON_LABEL
      }
      onToggle={(event) => setValue(event.target.checked)}
    />
  );
  if (lookupFailed) {
    // The checkbox stays available in case the server refuses the save.
    return (
      <div className="field-type" style={{ marginBottom: "var(--base)" }}>
        <Banner type="info">
          Could not check for possible duplicates. The server still checks for
          the same name when you save.
        </Banner>
        {confirmation}
      </div>
    );
  }
  if (matches.length === 0) return null;
  const needsConfirmation = matches.some((match) => match.needsConfirmation);

  return (
    <div className="field-type" style={{ marginBottom: "var(--base)" }}>
      <Banner type={needsConfirmation ? "error" : "info"}>
        <strong>Possible duplicates.</strong> Check these before saving:
        <ul style={{ margin: "calc(var(--base) / 2) 0 0" }}>
          {matches.map((match) => (
            <li key={match.id}>
              <a
                href={`${config.routes.admin}/collections/individuals/${match.id}`}
                target="_blank"
                rel="noreferrer"
              >
                {match.name}
              </a>
              {`${match.summary ? `, ${match.summary}` : ""} (${MATCH_LABELS[match.matchedOn]})`}
            </li>
          ))}
        </ul>
      </Banner>
      {needsConfirmation ? confirmation : null}
    </div>
  );
};
