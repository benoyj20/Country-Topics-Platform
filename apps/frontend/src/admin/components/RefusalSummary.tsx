import type { Refusal } from "@countrytopics/contracts";
import type { Ref } from "react";

import { fieldMessages } from "../form-state";

/**
 * A refused write's messages above the form, focused when it appears:
 * those about no field the form shows, then each field's, in the form's
 * order, linking to the field.
 */
export function RefusalSummary({
  ref,
  heading,
  refusal,
  order,
  fieldName,
  idPrefix = "",
}: {
  ref: Ref<HTMLDivElement>;
  heading: string;
  refusal: Refusal;
  /** The form's fields, in order. */
  order: readonly string[];
  fieldName: (key: string) => string;
  /** What the form's field ids start with (field-id-prefix.tsx). */
  idPrefix?: string;
}) {
  return (
    <div ref={ref} className="admin-error-summary" role="alert" tabIndex={-1}>
      <h2>{heading}</h2>
      <ul>
        {refusal.general.map((message) => (
          <li key={message}>{message}</li>
        ))}
        {fieldMessages(refusal, order).map(([key, message]) => (
          <li key={`${key}:${message}`}>
            <a href={`#${idPrefix}${key}`}>
              {fieldName(key)}: {message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
