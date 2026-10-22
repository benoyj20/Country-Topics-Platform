import type { ReactNode } from "react";

import { describedBy } from "./field-ids";

// A form field as the admin's editors show it: its label, what it is for,
// and the backend's messages about it, which its input points to.

export { describedBy };

export function FieldMessages({
  id,
  messages,
}: {
  id: string;
  messages?: readonly string[];
}) {
  if (!messages?.length) return null;
  return (
    <p id={`${id}-error`} className="admin-field-error">
      {messages.join(" ")}
    </p>
  );
}

export function Field({
  id,
  label,
  description,
  messages,
  required = false,
  children,
}: {
  /** The input's id. */
  id: string;
  label: string;
  description?: string;
  messages?: readonly string[];
  /** Needed to publish, as Payload's panel marks it. */
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={messages?.length ? "admin-field invalid" : "admin-field"}>
      <label htmlFor={id}>
        {label}
        {required && (
          <span className="admin-required" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>
      {description && (
        <p id={`${id}-description`} className="admin-muted">
          {description}
        </p>
      )}
      {children}
      <FieldMessages id={id} messages={messages} />
    </div>
  );
}

/** A yes-or-no field: the box, then its label. */
export function CheckField({
  id,
  label,
  description,
  messages,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  messages?: readonly string[];
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className={messages?.length ? "admin-field invalid" : "admin-field"}>
      <label className="admin-check">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          aria-describedby={describedBy(id, {
            description,
            invalid: Boolean(messages?.length),
          })}
          onChange={(event) => onChange(event.target.checked)}
        />
        {label}
      </label>
      {description && (
        <p id={`${id}-description`} className="admin-muted">
          {description}
        </p>
      )}
      <FieldMessages id={id} messages={messages} />
    </div>
  );
}
