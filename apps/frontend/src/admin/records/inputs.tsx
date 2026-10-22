"use client";

import { Field } from "../components/Field";
import type { FormApi } from "./RecordForm";

// A record form's plain fields: text, longer text, and a choice of
// values, each in its Field with its label, description, and messages.

/**
 * `{ [name]: text }` as a change to the form. TypeScript types an object
 * with a computed key as `{ [key: string]: string }`, never as a field of
 * `V`; `name` is one of V's fields, and these inputs are given only the
 * ones that hold text, or one of the choices a select offers.
 */
function textPatch<V>(name: keyof V & string, text: string): Partial<V> {
  return { [name]: text } as Partial<V>;
}

type InputProps<V> = {
  form: FormApi<V>;
  /** A field of the form's values that holds text. */
  name: keyof V & string;
  maxLength?: number;
  required?: boolean;
};

export function TextInput<V>({
  form,
  name,
  maxLength,
  required = false,
  large = false,
  type = "text",
}: InputProps<V> & { large?: boolean; type?: "text" | "url" }) {
  const field = form.field(name);
  return (
    <Field {...field} required={required}>
      <input
        id={field.id}
        className={large ? "admin-input large" : "admin-input"}
        type={type}
        inputMode={type === "url" ? "url" : undefined}
        value={String(form.values[name] ?? "")}
        maxLength={maxLength}
        disabled={form.readOnly}
        {...field.aria}
        onChange={(event) => form.set(textPatch<V>(name, event.target.value))}
      />
    </Field>
  );
}

export function TextArea<V>({
  form,
  name,
  maxLength,
  required = false,
  rows = 3,
}: InputProps<V> & { rows?: number }) {
  const field = form.field(name);
  return (
    <Field {...field} required={required}>
      <textarea
        id={field.id}
        className="admin-input"
        rows={rows}
        value={String(form.values[name] ?? "")}
        maxLength={maxLength}
        disabled={form.readOnly}
        {...field.aria}
        onChange={(event) => form.set(textPatch<V>(name, event.target.value))}
      />
    </Field>
  );
}

export function SelectInput<V>({
  form,
  name,
  options,
  required = false,
  placeholder,
}: InputProps<V> & {
  options: readonly { value: string; label: string }[];
  /** Offered first, for a field not chosen yet. */
  placeholder?: string;
}) {
  const field = form.field(name);
  return (
    <Field {...field} required={required}>
      <select
        id={field.id}
        className="admin-input"
        value={String(form.values[name] ?? "")}
        disabled={form.readOnly}
        {...field.aria}
        onChange={(event) => form.set(textPatch<V>(name, event.target.value))}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
