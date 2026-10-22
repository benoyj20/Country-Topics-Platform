"use client";

import {
  type AdminCollection,
  adminPickerSearchParams,
  type RelatedRecord,
} from "@countrytopics/contracts";
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import * as z from "zod";

import { recordName } from "../record-name";

/** How long typing pauses before the picker searches. */
const SEARCH_DELAY_MS = 250;

const Matches = z.object({
  docs: z.array(z.looseObject({ id: z.string() })),
});
type Match = z.infer<typeof Matches>["docs"][number];

type Search =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "found"; options: Match[] }
  | { kind: "failed"; status: number | null };

export type PickerProps<T extends RelatedRecord> = {
  /** The input's id, which the field's label and messages point at. */
  id: string;
  collection: AdminCollection;
  value: T[];
  onChange: (value: T[]) => void;
  /** One record (a new choice replaces it) or many. */
  multiple?: boolean;
  /** The record a search answer stands for, with what the field shows of it. */
  toRecord: (match: Match) => T;
  /** Fields read besides the title, for toRecord. */
  extra?: readonly string[];
  /** Only records this Payload `where` allows are offered. */
  where?: Record<string, unknown>;
  /** Shown beside a chosen record, such as a reference's check. */
  describe?: (record: T) => ReactNode;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
};

/**
 * Chooses related records by searching their collection, through the
 * same REST API and access rules as the lists: a combobox whose options
 * follow the typing, and the chosen records, each with a Remove button.
 */
export function RelationPicker<T extends RelatedRecord>({
  id,
  collection,
  value,
  onChange,
  multiple = false,
  toRecord,
  extra,
  where,
  describe,
  disabled = false,
  invalid = false,
  describedBy,
}: PickerProps<T>) {
  const listId = useId();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState<Search>({ kind: "idle" });
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const extraKey = (extra ?? []).join(",");
  // Records already chosen are left out by the backend, so a page of
  // matches is never used up by them.
  const chosenIds = value.map((record) => record.id);
  const whereKey = JSON.stringify(
    chosenIds.length > 0
      ? { and: [...(where ? [where] : []), { id: { not_in: chosenIds } }] }
      : (where ?? null),
  );

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearch({ kind: "searching" });
      const params = adminPickerSearchParams(collection, text, {
        extra: extraKey ? extraKey.split(",") : [],
        where: JSON.parse(whereKey) ?? undefined,
      });
      try {
        const response = await fetch(`/api/${collection}?${params}`, {
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) {
          setSearch({ kind: "failed", status: response.status });
          return;
        }
        const { docs } = Matches.parse(await response.json());
        setSearch({ kind: "found", options: docs });
        setActive(0);
      } catch {
        if (!controller.signal.aborted) {
          setSearch({ kind: "failed", status: null });
        }
      }
    }, SEARCH_DELAY_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, text, collection, whereKey, extraKey]);

  const chosen = new Set(value.map((record) => record.id));
  const options =
    search.kind === "found"
      ? search.options.filter((option) => !chosen.has(option.id))
      : [];

  function choose(match: Match) {
    const record = toRecord(match);
    onChange(multiple ? [...value, record] : [record]);
    setText("");
    setOpen(multiple);
    input.current?.focus();
  }

  function remove(record: T) {
    onChange(value.filter((item) => item.id !== record.id));
    input.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) =>
        options.length ? (current + step + options.length) % options.length : 0,
      );
    } else if (event.key === "Enter" && open) {
      // Choosing, not submitting the form.
      event.preventDefault();
      const option = options[active];
      if (option) choose(option);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  }

  const status =
    search.kind === "searching"
      ? "Searching…"
      : search.kind === "failed"
        ? search.status === null
          ? "The search could not reach the backend."
          : `The search failed (${search.status}).`
        : search.kind === "found" && options.length === 0
          ? text.trim()
            ? "Nothing matches."
            : "Nothing more to choose."
          : "";
  const activeId = options[active] ? `${listId}-${active}` : undefined;

  return (
    <div className="admin-picker">
      {value.length > 0 && (
        <ul className="admin-chosen">
          {value.map((record) => (
            <li key={record.id}>
              <span>
                {recordName(record)}
                {describe?.(record)}
              </span>
              {!disabled && (
                <button
                  type="button"
                  className="admin-link-button"
                  onClick={() => remove(record)}
                  aria-label={`Remove ${recordName(record)}`}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <div className="admin-combobox">
          <input
            ref={input}
            id={id}
            className="admin-input"
            type="text"
            role="combobox"
            autoComplete="off"
            placeholder={
              !multiple && value.length > 0 ? "Search to change" : "Search"
            }
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open ? activeId : undefined}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
          />
          <ul
            id={listId}
            role="listbox"
            className="admin-options"
            hidden={!open || options.length === 0}
          >
            {options.map((option, index) => (
              <li
                key={option.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                // Keeps the focus in the input, so the list stays open.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                {recordName(toRecord(option))}
              </li>
            ))}
          </ul>
          <p className="admin-picker-status" role="status">
            {open ? status : ""}
          </p>
        </div>
      )}
      {disabled && value.length === 0 && <p className="admin-muted">None</p>}
    </div>
  );
}
