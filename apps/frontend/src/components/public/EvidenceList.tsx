import type { PublicEvidence } from "@countrytopics/contracts";

import { SnippetPlayer } from "@/components/snippets/SnippetPlayer";
import { formatDate, formatFileSize } from "@/format";

import { FileCredit } from "./FileCredit";
import { DocumentIcon, ImageIcon, LinkIcon } from "./icons";
import styles from "./public.module.css";

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function Note({ note }: { note: string | null }) {
  return note ? <p>{note}</p> : null;
}

const KINDS = {
  image: { label: "Image", icon: <ImageIcon /> },
  document: { label: "Document", icon: <DocumentIcon /> },
  link: { label: "Web page", icon: <LinkIcon /> },
};

/** "Document", "Web page": what an item is, above its title. */
function Kind({ kind }: { kind: keyof typeof KINDS }) {
  return (
    <p className={styles.kind}>
      {KINDS[kind].icon}
      {KINDS[kind].label}
    </p>
  );
}

function EvidenceItem({ item }: { item: PublicEvidence }) {
  switch (item.kind) {
    case "snippet": {
      const { snippet } = item;
      return (
        <>
          <SnippetPlayer
            youtubeId={snippet.youtubeId}
            start_s={snippet.start_s}
            end_s={snippet.end_s}
            caption={item.title ?? snippet.caption}
            speaker={snippet.speaker?.name}
            speakerHref={
              snippet.speaker ? `/individuals/${snippet.speaker.slug}` : null
            }
            language={snippet.language}
            videoTitle={snippet.videoTitle}
            channel={snippet.channel}
            segments={snippet.segments}
            videoUnavailable={snippet.videoUnavailable}
          />
          {item.note ? <p className={styles.snippetNote}>{item.note}</p> : null}
        </>
      );
    }
    case "image":
      return (
        <figure className={styles.figure}>
          <Kind kind="image" />
          <a href={item.file.url}>
            {/* eslint-disable-next-line @next/next/no-img-element -- served by /files with its own cache headers; no resizing yet */}
            <img
              src={item.file.url}
              alt={item.file.alt}
              width={item.file.width ?? undefined}
              height={item.file.height ?? undefined}
              loading="lazy"
            />
          </a>
          <figcaption>
            {item.title ? <h3>{item.title}</h3> : null}
            <Note note={item.note} />
            <FileCredit file={item.file} />
          </figcaption>
        </figure>
      );
    case "document":
      return (
        <>
          <Kind kind="document" />
          <h3>
            <a href={item.file.url}>{item.title ?? item.file.filename}</a>
          </h3>
          <p className={styles.meta}>
            PDF
            {item.file.filesize !== null
              ? ` · ${formatFileSize(item.file.filesize)}`
              : null}
          </p>
          <Note note={item.note} />
          <FileCredit file={item.file} />
        </>
      );
    case "link":
      return (
        <>
          <Kind kind="link" />
          <h3>
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              {item.title ?? hostOf(item.url)}
            </a>
          </h3>
          <p className={styles.meta}>
            {hostOf(item.url)}
            {item.archive ? (
              <>
                {" · "}
                <a
                  href={item.archive.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Archived copy
                  {item.archive.capturedAt
                    ? ` (${formatDate(item.archive.capturedAt)})`
                    : null}
                </a>
              </>
            ) : null}
            {item.otherArchiveUrl ? (
              <>
                {" · "}
                <a
                  href={item.otherArchiveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Copy in another archive
                </a>
              </>
            ) : null}
          </p>
          <Note note={item.note} />
        </>
      );
  }
}

/** A topic's evidence, in the order the admin listed it. */
export function EvidenceList({ evidence }: { evidence: PublicEvidence[] }) {
  return (
    <ol className={styles.list}>
      {evidence.map((item, index) => (
        <li
          key={index}
          className={
            // The snippet player draws its own frame.
            item.kind === "snippet"
              ? styles.item
              : `${styles.item} ${styles.card}`
          }
        >
          <EvidenceItem item={item} />
        </li>
      ))}
    </ol>
  );
}
