import { REFERENCE_KIND_LABELS, STANCE_LABELS } from "@/content-labels";
import { formatPartialDate } from "@/public/format";
import type {
  CitedReference,
  ProfileSource,
  PublicReference,
} from "@/public/types";

import styles from "./public.module.css";

function Citation({ reference }: { reference: PublicReference }) {
  const source = [reference.containerTitle, reference.publisher]
    .filter(Boolean)
    .join(", ");
  return (
    <>
      <h3>{reference.title}</h3>
      <p className={styles.meta}>
        {[
          reference.authors.join(", "),
          reference.publishedDate
            ? formatPartialDate(reference.publishedDate)
            : null,
          source,
          REFERENCE_KIND_LABELS[reference.kind],
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <ul className={styles.identifiers}>
        {reference.doi ? (
          <li>
            DOI{" "}
            <a
              href={`https://doi.org/${encodeURI(reference.doi)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {reference.doi}
            </a>
          </li>
        ) : null}
        {reference.isbn ? (
          <li>
            ISBN{" "}
            <a
              href={`https://openlibrary.org/isbn/${reference.isbn}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {reference.isbn}
            </a>
          </li>
        ) : null}
        {reference.url ? (
          <li>
            <a href={reference.url} target="_blank" rel="noopener noreferrer">
              Read it online
            </a>
          </li>
        ) : null}
      </ul>
    </>
  );
}

/** The references a topic cites, each with its stance and passage. */
export function ReferenceList({
  references,
}: {
  references: CitedReference[];
}) {
  return (
    <ol className={styles.list}>
      {references.map((cited, index) => (
        <li key={index} className={styles.item}>
          <p>
            <span
              className={`${styles.badge} ${
                cited.stance === "supports"
                  ? styles.supports
                  : cited.stance === "contradicts"
                    ? styles.contradicts
                    : ""
              }`}
            >
              {STANCE_LABELS[cited.stance]}
            </span>
          </p>
          <Citation reference={cited.reference} />
          <blockquote className={styles.passage}>
            <p>{cited.passage}</p>
          </blockquote>
          {cited.locator ? (
            <p className={styles.meta}>{cited.locator}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** The references a profile cites for the bio and roles, with their passages. */
export function SourceList({ sources }: { sources: ProfileSource[] }) {
  return (
    <ol className={styles.list}>
      {sources.map((source, index) => (
        <li key={index} className={styles.item}>
          <Citation reference={source.reference} />
          <blockquote className={styles.passage}>
            <p>{source.passage}</p>
          </blockquote>
          {source.locator ? (
            <p className={styles.meta}>{source.locator}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
