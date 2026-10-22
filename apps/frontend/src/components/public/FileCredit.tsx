import type { PublicFile } from "@countrytopics/contracts";
import { LICENCE_LABELS } from "@countrytopics/domain";

import styles from "./public.module.css";

/** Who made a file, under what licence, and where it came from. */
export function FileCredit({ file }: { file: PublicFile }) {
  return (
    <p className={styles.credit}>
      {file.credit ? `${file.credit} · ` : null}
      {LICENCE_LABELS[file.licence]}
      {file.sourceUrl ? (
        <>
          {" · "}
          <a href={file.sourceUrl} target="_blank" rel="noopener noreferrer">
            Source
          </a>
        </>
      ) : null}
    </p>
  );
}
