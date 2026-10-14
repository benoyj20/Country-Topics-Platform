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
import { useEffect, useState } from "react";

import type { PossibleDuplicate } from "@/individuals/duplicates";

const LOOKUP_DELAY_MS = 400;

const MATCH_LABELS: Record<PossibleDuplicate["matchedOn"], string> = {
  wikidata: "same Wikidata ID",
  name: "same name",
  alias: "same name as an alias",
  "similar name": "similar name",
};

/**
 * The duplicate warning (F2): as the admin types a name, aliases, or a
 * Wikidata ID, lists individuals who may be the same person. An exact name or
 * alias match must be confirmed with the checkbox before the server saves.
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

  useEffect(() => {
    const params = new URLSearchParams();
    if (typeof name === "string") params.set("name", name);
    for (const alias of aliases.split("\n")) {
      if (alias.trim()) params.append("alias", alias);
    }
    if (typeof wikidataId === "string" && /^Q[1-9][0-9]*$/.test(wikidataId))
      params.set("wikidataId", wikidataId);
    if (id) params.set("exclude", String(id));

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `${config.serverURL}${config.routes.api}/individuals/possible-duplicates?${params}`,
          { credentials: "same-origin", signal: controller.signal },
        );
        if (!response.ok) return;
        const body = (await response.json()) as {
          matches: PossibleDuplicate[];
        };
        setMatches(body.matches);
      } catch {
        // Aborted by a newer lookup, or offline: the server still checks on save.
      }
    }, LOOKUP_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [name, aliases, wikidataId, id, config.serverURL, config.routes.api]);

  if (matches.length === 0) return null;
  const needsConfirmation = matches.some(
    (match) => match.matchedOn === "name" || match.matchedOn === "alias",
  );
  const label =
    typeof field.label === "string"
      ? field.label
      : "This is a different person";

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
      {needsConfirmation ? (
        <CheckboxInput
          id={`field-${path}`}
          name={path}
          checked={value === true}
          label={label}
          onToggle={(event) => setValue(event.target.checked)}
        />
      ) : null}
    </div>
  );
};
