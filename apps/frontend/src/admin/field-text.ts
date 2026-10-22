import type { Refusal } from "@countrytopics/contracts";

import { describedBy } from "./components/field-ids.ts";

// What an editor calls each of its fields and what it says about them, as
// Payload's panel does (apps/web/src/collections), and the props a field
// gets from it and from a refusal's messages. A field's key is its path in
// the form, such as `statements.0.evidence.1.url`.

export type FieldText = {
  label: string;
  description?: string;
  /** For an array: what one row is called, and its rows' fields. */
  row?: string;
  fields?: FieldTexts;
};

export type FieldTexts = Readonly<Record<string, FieldText>>;

/** The parts of `key`: each field with the row number after it, if any. */
function steps(key: string): { field: string; index?: number }[] {
  const parts = key.split(".");
  const result: { field: string; index?: number }[] = [];
  for (let at = 0; at < parts.length; at++) {
    const field = parts[at] ?? "";
    const next = parts[at + 1];
    if (next !== undefined && /^\d+$/.test(next)) {
      result.push({ field, index: Number(next) });
      at++;
    } else {
      result.push({ field });
    }
  }
  return result;
}

/** The text of the field at `key`. */
export function textAt(texts: FieldTexts, key: string): FieldText | undefined {
  let level: FieldTexts | undefined = texts;
  let text: FieldText | undefined;
  for (const { field } of steps(key)) {
    text = level?.[field];
    level = text?.fields;
  }
  return text;
}

/**
 * A field's name in a list of messages, with the rows it is in, such as
 * "Statement 1, Evidence 2, Link".
 */
export function fieldNameAt(texts: FieldTexts, key: string): string {
  let level: FieldTexts | undefined = texts;
  const names: string[] = [];
  for (const { field, index } of steps(key)) {
    const text: FieldText | undefined = level?.[field];
    if (index === undefined) names.push(text?.label ?? field);
    else names.push(`${text?.row ?? text?.label ?? field} ${index + 1}`);
    level = text?.fields;
  }
  return names.join(", ");
}

/** What one row of the array at `key` is called. */
export function rowNameAt(texts: FieldTexts, key: string): string {
  const text = textAt(texts, key);
  return text?.row ?? text?.label ?? key;
}

export type FieldProps = {
  id: string;
  label: string;
  description?: string;
  messages?: string[];
  aria: {
    "aria-invalid"?: true;
    "aria-describedby"?: string;
  };
};

/** The props of the field at `key`: its text, and the refusal's messages about it. */
export function fieldProps(
  texts: FieldTexts,
  key: string,
  refusal: Refusal | null,
): FieldProps {
  const text = textAt(texts, key);
  const messages = refusal?.fields[key];
  return {
    id: key,
    label: text?.label ?? key,
    description: text?.description,
    messages,
    aria: {
      "aria-invalid": messages?.length ? true : undefined,
      "aria-describedby": describedBy(key, {
        description: text?.description,
        invalid: Boolean(messages?.length),
      }),
    },
  };
}

/** An array field's heading and messages (ArrayField), from its props. */
export function arrayProps({ id, label, description, messages }: FieldProps) {
  return { id, label, description, messages };
}

/** A picker's props, from a field's. */
export function pickerAria(field: FieldProps) {
  return {
    invalid: Boolean(field.aria["aria-invalid"]),
    describedBy: field.aria["aria-describedby"],
  };
}
