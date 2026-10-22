import {
  type RelatedRecord,
  RichTextBody,
  type TopicValues,
} from "@countrytopics/contracts";
import {
  EVIDENCE_KIND_LABELS,
  PERSON_ROLE_LABELS,
  REFERENCE_CHECK_LABELS,
  STANCE_LABELS,
} from "@countrytopics/domain";
import type { ReactNode } from "react";

import { recordName } from "@/admin/record-name";
import { safeHref } from "@/admin/safe-href";
import { RichTextView } from "@/shared/RichTextView";

import { TOPIC_TEXTS } from "./topic-text";

// A topic's fields, read only, as a version kept them.

const label = (key: string) => TOPIC_TEXTS[key]?.label ?? key;

const none = <span className="admin-muted">None</span>;

/** A stored address, linked when it is one that may be. */
function Address({ url, children }: { url: string; children?: ReactNode }) {
  const href = safeHref(url);
  return href ? (
    <a href={href} target="_blank" rel="noreferrer">
      {children ?? url}
    </a>
  ) : (
    <>{children ?? url}</>
  );
}

function Names({ records }: { records: RelatedRecord[] }) {
  return records.length > 0 ? <>{records.map(recordName).join(", ")}</> : none;
}

function Rows({ name, children }: { name: string; children: ReactNode[] }) {
  return (
    <section className="admin-stack" aria-labelledby={`view-${name}`}>
      <h2 id={`view-${name}`}>{label(name)}</h2>
      {children.length > 0 ? (
        <ol className="admin-view-rows">{children}</ol>
      ) : (
        <p className="admin-muted">None</p>
      )}
    </section>
  );
}

export function TopicView({ values }: { values: TopicValues }) {
  const body = RichTextBody.safeParse(values.body);
  const details: [string, ReactNode][] = [
    ["title", values.title || none],
    ["summary", values.summary || none],
    ["countries", <Names key="countries" records={values.countries} />],
    [
      "category",
      <Names
        key="category"
        records={values.category ? [values.category] : []}
      />,
    ],
    ["tags", <Names key="tags" records={values.tags} />],
    ["archived", values.archived ? "Yes" : "No"],
    ["slug", values.slug || none],
  ];
  return (
    <div className="admin-stack">
      <dl className="admin-details wide">
        {details.map(([key, value]) => (
          <div key={key}>
            <dt>{label(key)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <section className="admin-stack" aria-labelledby="view-body">
        <h2 id="view-body">{label("body")}</h2>
        {body.success ? (
          <div className="admin-rich-text">
            <RichTextView
              body={body.data}
              hrefOf={(target) =>
                `/admin/collections/${target.relationTo}/${target.id}`
              }
            />
          </div>
        ) : (
          <p className="admin-muted">No body.</p>
        )}
      </section>
      <Rows name="people">
        {values.people.map((row, index) => (
          <li key={row.id ?? index}>
            {row.individual ? recordName(row.individual) : "No individual"},{" "}
            {PERSON_ROLE_LABELS[row.role]}
          </li>
        ))}
      </Rows>
      <Rows name="evidence">
        {values.evidence.map((row, index) => (
          <li key={row.id ?? index}>
            <p>
              <strong>{row.title || row.snippet?.title || "Untitled"}</strong> (
              {EVIDENCE_KIND_LABELS[row.kind]})
            </p>
            {row.kind === "link" && row.url && (
              <p>
                <Address url={row.url} />
                {row.archiveUrl && (
                  <>
                    {" "}
                    (copy: <Address url={row.archiveUrl} />)
                  </>
                )}
              </p>
            )}
            {(row.kind === "document" || row.kind === "image") && (
              <p>
                {row.file?.url ? (
                  <Address url={row.file.url}>{recordName(row.file)}</Address>
                ) : row.file ? (
                  recordName(row.file)
                ) : (
                  "No file"
                )}
              </p>
            )}
            {row.kind === "snippet" && (
              <p>{row.snippet ? recordName(row.snippet) : "No snippet"}</p>
            )}
            {row.note && <p className="admin-muted">{row.note}</p>}
          </li>
        ))}
      </Rows>
      <Rows name="references">
        {values.references.map((row, index) => (
          <li key={row.id ?? index}>
            <p>
              <strong>
                {row.reference ? recordName(row.reference) : "No reference"}
              </strong>{" "}
              ({STANCE_LABELS[row.stance]}
              {row.reference?.checkStatus
                ? `; ${REFERENCE_CHECK_LABELS[row.reference.checkStatus]}`
                : ""}
              )
            </p>
            {row.passage && <blockquote>{row.passage}</blockquote>}
            {row.locator && <p className="admin-muted">{row.locator}</p>}
          </li>
        ))}
      </Rows>
    </div>
  );
}
