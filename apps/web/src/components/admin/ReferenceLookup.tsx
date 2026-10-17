"use client";

import { REFERENCE_KINDS } from "@countrytopics/domain";
import {
  Banner,
  Button,
  useConfig,
  useForm,
  useFormFields,
} from "@payloadcms/ui";
import type { UIFieldClientComponent } from "payload";
import { useState } from "react";
import * as z from "zod";

const lookupResponse = z.union([
  z.object({
    found: z.literal(true),
    doi: z.string().nullable(),
    isbn: z.string().nullable(),
    metadata: z.object({
      source: z.string(),
      kind: z.enum(REFERENCE_KINDS).optional(),
      title: z.string().optional(),
      authors: z.array(z.string()),
      containerTitle: z.string().optional(),
      publisher: z.string().optional(),
      publishedDate: z.string().optional(),
    }),
  }),
  z.object({
    found: z.literal(false),
    doi: z.string().nullable(),
    isbn: z.string().nullable(),
  }),
  z.object({ error: z.string() }),
]);

type Message = { type: "success" | "info" | "error"; text: string };

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

/**
 * "Look up": fills the reference's empty fields from the record that
 * Crossref, the DOI system, or Open Library holds for its DOI or ISBN. It never overwrites what the admin typed. Whether the reference is
 * confirmed is decided by the worker's check after saving.
 */
export const ReferenceLookup: UIFieldClientComponent = () => {
  const { config } = useConfig();
  const { dispatchFields, setModified } = useForm();
  // One selector per field: each returns a string, which compares by value,
  // so typing elsewhere in the form does not re-render this button.
  const doi = useFormFields(([fields]) => text(fields.doi?.value));
  const isbn = useFormFields(([fields]) => text(fields.isbn?.value));
  const current = {
    title: useFormFields(([fields]) => text(fields.title?.value)),
    authors: useFormFields(([fields]) => text(fields.authors?.value)),
    containerTitle: useFormFields(([fields]) =>
      text(fields.containerTitle?.value),
    ),
    publisher: useFormFields(([fields]) => text(fields.publisher?.value)),
    publishedDate: useFormFields(([fields]) =>
      text(fields.publishedDate?.value),
    ),
  };
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function lookUp() {
    const params = new URLSearchParams(doi ? { doi } : { isbn });
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(
        `${config.serverURL}${config.routes.api}/references/lookup?${params}`,
        { credentials: "same-origin" },
      );
      const body = lookupResponse.parse(await response.json());
      if ("error" in body) {
        setMessage({ type: "error", text: body.error });
        return;
      }
      if (!body.found) {
        setMessage({
          type: "error",
          text: `No record was found for this ${doi ? "DOI" : "ISBN"}. Check it for typos.`,
        });
        return;
      }
      const { metadata } = body;
      const update = (path: string, value: string | undefined) => {
        if (value) dispatchFields({ type: "UPDATE", path, value });
      };
      // The normalised identifier, as it will be saved.
      update(doi ? "doi" : "isbn", (doi ? body.doi : body.isbn) ?? undefined);
      const filled: string[] = [];
      for (const [field, value] of [
        ["title", metadata.title],
        ["authors", metadata.authors.join("\n")],
        ["containerTitle", metadata.containerTitle],
        ["publisher", metadata.publisher],
        ["publishedDate", metadata.publishedDate],
      ] as const) {
        if (value && !current[field]) {
          update(field, value);
          filled.push(field);
        }
      }
      if (metadata.kind && !current.title) update("kind", metadata.kind);
      setModified(true);
      setMessage({
        type: "success",
        text:
          filled.length > 0
            ? `Found in ${metadata.source}; empty fields were filled in. Check them before saving.`
            : `Found in ${metadata.source}. Fields you had filled in were left as they are.`,
      });
    } catch (error) {
      console.error(error);
      setMessage({
        type: "error",
        text: "The lookup failed. Try again, or fill in the details by hand.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field-type" style={{ marginBottom: "var(--base)" }}>
      <Button
        buttonStyle="secondary"
        size="small"
        disabled={busy || (!doi && !isbn)}
        onClick={() => void lookUp()}
      >
        {busy ? "Looking up…" : "Look up DOI or ISBN"}
      </Button>
      {message ? <Banner type={message.type}>{message.text}</Banner> : null}
    </div>
  );
};
