import type { ReactNode } from "react";

import { formatDateTime } from "@/format";

// What the records only the worker writes share (videos, archived links):
// read only, with what the worker found and when.

const never = "Not yet";

/** When the worker did something, or that it has not yet. */
export const when = (value: string | null | undefined) =>
  value ? formatDateTime(value) : never;

/** The worker's findings, as terms and their values. */
export function WorkerDetails({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="admin-details wide">
      {rows.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
