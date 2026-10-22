"use client";

import {
  type AdminCollection,
  isDuplicated,
  isVersioned,
  type RecordDates,
  type Refusal,
} from "@countrytopics/contracts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from "react";

import { formatDateTime } from "@/format";

import { useAdminAccount } from "../account-context";
import { DuplicateButton } from "../components/DuplicateButton";
import { RefusalSummary } from "../components/RefusalSummary";
import {
  useArrivedNotice,
  useLeaveGuard,
  useRefusalFocus,
  useSaveShortcut,
} from "../editor-guards";
import {
  type FieldProps,
  fieldNameAt,
  fieldProps,
  type FieldTexts,
} from "../field-text";
import { useFieldIdPrefix } from "../field-id-prefix";
import { clearMessages, valuesAfterAnswer } from "../form-state";
import { LockNotice } from "../locks/LockNotice";
import { useDocumentLock } from "../locks/use-document-lock";
import type { Written } from "../write";

// An editor of one record (ADR 0014, phases 9 to 11), as Payload's panel
// edits countries, categories, tags, individuals, references, files,
// snippets, comments, reports, feedback, invitations, and accounts: the
// fields its editor draws, saved through Payload's REST API, and every
// refusal shown beside the field it names and above the form. While open
// it holds the record's lock, so nobody else saves over it; a saved record
// can be duplicated, and a versioned one links its versions. Each record
// type's editor gives it its fields and how it saves.

/** What an editor's fields work with. */
export type FormApi<V> = {
  values: V;
  readOnly: boolean;
  refusal: Refusal | null;
  /**
   * Sets fields, clearing the messages about them; with `rows`, as when
   * an array's rows move, those about its rows too.
   */
  set: (patch: Partial<V>, options?: { rows?: boolean }) => void;
  /**
   * Changes the values deep inside, such as a row's field, clearing the
   * messages at `keys`; with `rows`, those about their rows too.
   */
  update: (
    next: (values: V) => V,
    keys: readonly string[],
    options?: { rows?: boolean },
  ) => void;
  /** Clears the messages at `keys`, for what the values do not hold, such as a file. */
  clear: (keys: readonly string[]) => void;
  /** A field's text, messages, and ARIA. */
  field: (key: string) => FieldProps;
};

/** What a save answers: the record as the form reads it. */
export type Saved<V, S> = { id: string; values: V; status: S };

export type RecordFormProps<V, S extends RecordDates> = {
  /** Null for a record not yet saved. */
  id: string | null;
  values: V;
  status: S | null;
  /** What one record is called, such as "category". */
  noun: string;
  /**
   * The record's collection: a deleted record goes back to its list, and
   * a new one moves to its address once saved.
   */
  collection: AdminCollection;
  canEdit: boolean;
  /** Offers Delete for a record that exists. */
  canDelete?: boolean;
  /** What Delete asks first; by default, whether to delete the record. */
  deleteQuestion?: string;
  /** Said when the reader may not edit. */
  readOnlyNotice: string;
  /** Shown once, after the save that led here. */
  notice?: string;
  texts: FieldTexts;
  /** The form's fields in order, for listing a refusal's messages. */
  order: readonly string[];
  /**
   * What a save sends, for telling whether anything changed: the same
   * function from one render to the next.
   */
  saveBody: (values: V) => unknown;
  save: (id: string | null, values: V) => Promise<Written<Saved<V, S>>>;
  /**
   * What to ask before a save that cannot be undone, such as erasing a
   * comment's text; null to save without asking.
   */
  confirmSave?: (values: V, status: S | null) => string | null;
  remove?: (id: string) => Promise<Written<null>>;
  /** Something besides the values is waiting to be saved, such as a file. */
  pending?: boolean;
  /** After each save the backend took, with the record as it is now. */
  onSaved?: (saved: Saved<V, S>) => void;
  /**
   * A new record made from another's field, in a dialog: called with its
   * id once saved, instead of moving to it.
   */
  onCreated?: (id: string) => void;
  /** The fields, with the record as the last save left it. */
  children: (form: FormApi<V>, status: S | null) => ReactNode;
  /** Beside the fields, before the record's details. */
  side?: (form: FormApi<V>, status: S | null) => ReactNode;
  /** The saved record's details, besides its dates, and links about it. */
  details?: (status: S) => DetailsProps;
};

type Outcome =
  { kind: "saved" } | { kind: "refused"; deleting: boolean; refusal: Refusal };

export function RecordForm<V, S extends RecordDates>({
  id,
  values: loaded,
  status: loadedStatus,
  noun,
  collection,
  canEdit,
  canDelete = false,
  deleteQuestion,
  readOnlyNotice,
  notice: arrivedNotice,
  texts,
  order,
  saveBody,
  save: send,
  confirmSave,
  remove: sendDelete,
  pending = false,
  onSaved,
  onCreated,
  children,
  side,
  details,
}: RecordFormProps<V, S>) {
  const router = useRouter();
  const listHref = `/admin/collections/${collection}`;
  const recordHref = (record: string) =>
    `${listHref}/${encodeURIComponent(record)}`;
  const saved = (values: V) => JSON.stringify(saveBody(values));
  const [values, setValues] = useState(loaded);
  const [savedValues, setSavedValues] = useState(() => saved(loaded));
  const [status, setStatus] = useState(loadedStatus);
  // After a save the page is read again (router.refresh), as it is now.
  const [shownStatus, setShownStatus] = useState(loadedStatus);
  if (loadedStatus !== shownStatus) {
    setShownStatus(loadedStatus);
    if (
      loadedStatus &&
      (!status || loadedStatus.updatedAt >= status.updatedAt)
    ) {
      setStatus(loadedStatus);
    }
  }
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [notice, setNotice] = useState(arrivedNotice ?? null);
  const [working, setWorking] = useState<"save" | "delete" | null>(null);
  // Set while a save or delete runs, and for good once the page moves on:
  // state would let a second click in.
  const busy = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [summaryRef, refused] = useRefusalFocus();
  const idPrefix = useFieldIdPrefix();
  const account = useAdminAccount();
  const lock = useDocumentLock({
    collection,
    id,
    user: account?.id ?? null,
    enabled: canEdit,
  });
  // While someone else holds the lock, the backend refuses this reader's
  // saves: the form is read only until they leave or the reader takes over.
  const readOnly = !canEdit || lock.state.kind === "theirs";
  const refusal = outcome?.kind === "refused" ? outcome.refusal : null;
  // What would be saved now; a snippet's can hold a long transcript, so
  // it is worked out when the values change, not on every render.
  const unsaved = useMemo(
    () => JSON.stringify(saveBody(values)),
    [saveBody, values],
  );
  const dirty = canEdit && (pending || unsaved !== savedValues);

  useArrivedNotice(arrivedNotice);
  useLeaveGuard(dirty);
  useSaveShortcut(() => void save(), !readOnly, formRef);

  function clear(keys: readonly string[], rows = false) {
    setOutcome((current) => {
      if (current?.kind !== "refused") return current;
      let next = current.refusal;
      for (const key of keys) next = clearMessages(next, key, { rows });
      // Unchanged, so the form is not drawn again for nothing.
      const same =
        Object.keys(next.fields).length ===
        Object.keys(current.refusal.fields).length;
      return same ? current : { ...current, refusal: next };
    });
  }

  const form: FormApi<V> = {
    values,
    readOnly,
    refusal,
    set: (patch, options) => {
      setValues((current) => ({ ...current, ...patch }));
      clear(Object.keys(patch), options?.rows);
    },
    update: (next, keys, options) => {
      setValues(next);
      clear(keys, options?.rows);
    },
    clear: (keys) => clear(keys),
    field: (key) => fieldProps(texts, key, refusal, idPrefix),
  };

  function refuse(deleting: boolean, refusal: Refusal) {
    setOutcome({ kind: "refused", deleting, refusal });
    refused();
  }

  async function save() {
    if (busy.current || readOnly) return;
    const question = confirmSave?.(values, status);
    if (question && !window.confirm(question)) return;
    busy.current = true;
    setNotice(null);
    setWorking("save");
    const sent = values;
    let leaving = false;
    try {
      const answer = await send(id, sent);
      if (!answer.ok) {
        refuse(false, answer.refusal);
        return;
      }
      const record = answer.result;
      onSaved?.(record);
      if (!id) {
        leaving = true;
        if (onCreated) {
          // Saved, so nothing is left to lose when the dialog closes.
          setSavedValues(saved(record.values));
          onCreated(record.id);
        } else {
          router.replace(`${recordHref(record.id)}?saved=created`);
        }
        return;
      }
      setValues((current) =>
        valuesAfterAnswer(current, sent, record.values, saved),
      );
      setSavedValues(saved(record.values));
      setStatus(record.status);
      setOutcome({ kind: "saved" });
      // The save cleared the record's lock.
      lock.relock();
      // The title and anything else the page shows of the record.
      router.refresh();
    } finally {
      if (!leaving) {
        busy.current = false;
        setWorking(null);
      }
    }
  }

  async function remove() {
    if (!id || !sendDelete || busy.current || readOnly) return;
    if (
      !window.confirm(
        deleteQuestion ?? `Delete this ${noun}? It cannot be brought back.`,
      )
    ) {
      return;
    }
    busy.current = true;
    setWorking("delete");
    let leaving = false;
    try {
      const answer = await sendDelete(id);
      if (!answer.ok) {
        refuse(true, answer.refusal);
        return;
      }
      // Nothing is left to lose.
      leaving = true;
      setSavedValues(saved(values));
      router.push(listHref);
    } finally {
      if (!leaving) {
        busy.current = false;
        setWorking(null);
      }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // React passes events up through portals: a form in a field's dialog
    // must not also submit the editor behind it.
    event.stopPropagation();
    void save();
  }

  const shown = status ? details?.(status) : undefined;
  const links = [
    ...(shown?.links ?? []),
    ...(id && isVersioned(collection)
      ? [{ href: `${recordHref(id)}/versions`, label: "Versions" }]
      : []),
  ];

  return (
    <form ref={formRef} className="record-editor" onSubmit={submit} noValidate>
      <div className="record-editor-bar">
        <p className="record-editor-state">
          <span>
            {status
              ? `Saved ${formatDateTime(status.updatedAt)}`
              : `New ${noun}, not saved yet`}
          </span>
          {dirty && <span className="admin-badge">Unsaved changes</span>}
        </p>
        {canEdit && (
          <div className="admin-actions">
            {id && isDuplicated(collection) && !onCreated && (
              <DuplicateButton
                collection={collection}
                id={id}
                noun={noun}
                dirty={dirty}
                disabled={working !== null}
                onRefused={(refusal) => refuse(false, refusal)}
              />
            )}
            {id && canDelete && sendDelete && (
              <button
                type="button"
                className="admin-button secondary danger"
                disabled={working !== null || readOnly}
                onClick={() => void remove()}
              >
                {working === "delete" ? "Deleting…" : "Delete"}
              </button>
            )}
            <button
              type="submit"
              className="admin-button"
              disabled={working !== null || readOnly}
            >
              {working === "save" ? "Saving…" : id ? "Save" : `Create ${noun}`}
            </button>
          </div>
        )}
      </div>

      <LockNotice state={lock.state} noun={noun} onTakeOver={lock.takeOver} />
      {!canEdit && <p className="admin-notice">{readOnlyNotice}</p>}
      {notice && (
        <p className="admin-notice good" role="status">
          {notice}
        </p>
      )}
      {outcome?.kind === "saved" && (
        <p className="admin-notice good" role="status">
          Saved.
        </p>
      )}
      {refusal && (
        <RefusalSummary
          ref={summaryRef}
          heading={
            outcome?.kind === "refused" && outcome.deleting
              ? "Not deleted"
              : "Not saved"
          }
          refusal={refusal}
          order={order}
          fieldName={(key) => fieldNameAt(texts, key)}
          idPrefix={idPrefix}
        />
      )}

      {!readOnly && (
        <p className="admin-muted">
          <span aria-hidden="true">*</span> Required.
        </p>
      )}
      <div className="record-editor-columns">
        <div className="record-editor-main">{children(form, status)}</div>
        <aside className="record-editor-side" aria-label="Details">
          {side?.(form, status)}
          {status && (
            <RecordDetails dates={status} rows={shown?.rows} links={links} />
          )}
        </aside>
      </div>
    </form>
  );
}

type DetailsProps = {
  /** Shown before the dates. */
  rows?: [string, ReactNode][];
  links?: { href: string; label: string; external?: boolean }[];
};

/** When a record was made and last changed, and links about it. */
export function RecordDetails({
  dates,
  rows = [],
  links = [],
}: DetailsProps & { dates: RecordDates }) {
  const all: [string, ReactNode][] = [
    ...rows,
    ["Created", formatDateTime(dates.createdAt)],
    ["Updated", formatDateTime(dates.updatedAt)],
  ];
  return (
    <section className="admin-card" aria-labelledby="record-details">
      <h2 id="record-details">Details</h2>
      <dl className="admin-details">
        {all.map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {links.length > 0 && (
        <ul className="admin-links">
          {links.map((link) => (
            <li key={link.href}>
              {link.external ? (
                <a href={link.href} target="_blank" rel="noreferrer">
                  {link.label}
                </a>
              ) : (
                <Link href={link.href}>{link.label}</Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
