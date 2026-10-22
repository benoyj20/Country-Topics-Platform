import {
  ADMIN_LIST_LIMITS,
  ADMIN_LISTS,
  ADMIN_RELATED_MATCHES_MAX,
  type AdminCollection,
  type AdminPage,
  type AdminRow,
  relatedTitle,
} from "@countrytopics/contracts";
import Link from "next/link";
import type { ReactNode } from "react";

import { formatDateTime } from "@/format";

import { COLLECTION_TEXT, fieldLabel, valueLabel } from "../collections";
import {
  type FilterValue,
  listHref,
  type ListState,
  sortableFields,
  sortAfter,
} from "../list-state";
import { FilterForm } from "./FilterForm";
import { SearchBox } from "./SearchBox";

// One collection's list, as Payload's panel shows it: search, filters,
// columns that sort, page sizes, and pages. Everything is a link or a
// form, so it works before scripts load; the search box follows typing.

const RELATED_SHOWN = 3;

/** Values short enough to keep on one line. */
const SHORT_KINDS = new Set(["date", "select", "boolean", "number"]);

function recordHref(collection: AdminCollection, id: string): string {
  return `/admin/collections/${collection}/${encodeURIComponent(id)}`;
}

function relatedName(to: AdminCollection, value: unknown): string | null {
  const related = relatedTitle(to, value);
  if (!related) return null;
  return (
    related.title || `${COLLECTION_TEXT[to].singular} ${related.id.slice(-8)}`
  );
}

/** A cell's text, or null when the record has no value there. */
function cellText(
  collection: AdminCollection,
  field: string,
  row: AdminRow,
): string | null {
  const definition = ADMIN_LISTS[collection].fields[field];
  const value = row[field];
  if (value === null || value === undefined || value === "") return null;
  switch (definition?.kind) {
    case "date":
      return typeof value === "string" ? formatDateTime(value) : null;
    case "boolean":
      return value ? "Yes" : "No";
    case "number":
      return String(value);
    case "select":
      return valueLabel(collection, field, String(value));
    case "relationship": {
      const values = Array.isArray(value) ? value : [value];
      const names = values
        .map((item) => relatedName(definition.to, item))
        .filter((name): name is string => name !== null);
      if (names.length === 0) return null;
      const shown = names.slice(0, RELATED_SHOWN).join(", ");
      const more = names.length - RELATED_SHOWN;
      return more > 0 ? `${shown}, and ${more} more` : shown;
    }
    default:
      return typeof value === "string" ? value : String(value);
  }
}

function Thumbnail({ row }: { row: AdminRow }) {
  const { url, mimeType } = row;
  if (typeof url !== "string" || typeof mimeType !== "string") return null;
  if (!mimeType.startsWith("image/")) return null;
  // Served by the backend to staff only, through /api; next/image would
  // fetch it without the staff member's cookie.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="admin-thumb"
      src={url}
      alt=""
      width={40}
      height={40}
      loading="lazy"
    />
  );
}

function Cell({
  collection,
  field,
  row,
  isFirst,
}: {
  collection: AdminCollection;
  field: string;
  row: AdminRow;
  isFirst: boolean;
}) {
  const text = cellText(collection, field, row);
  if (!isFirst) {
    const kind = ADMIN_LISTS[collection].fields[field]?.kind;
    return (
      <td className={kind && SHORT_KINDS.has(kind) ? "short" : undefined}>
        {text ?? <span className="admin-none">None</span>}
      </td>
    );
  }
  // The first column opens the record, whatever it shows.
  const title = cellText(collection, ADMIN_LISTS[collection].title, row);
  return (
    <th scope="row">
      <span className="admin-title-cell">
        {collection === "media" && <Thumbnail row={row} />}
        <Link href={recordHref(collection, row.id)}>
          {text ??
            title ??
            `Untitled ${COLLECTION_TEXT[collection].singular.toLowerCase()}`}
        </Link>
      </span>
    </th>
  );
}

function SortHeader({
  collection,
  field,
  state,
}: {
  collection: AdminCollection;
  field: string;
  state: ListState;
}) {
  const label = fieldLabel(collection, field);
  if (!sortableFields(collection).includes(field)) {
    return <th scope="col">{label}</th>;
  }
  const direction =
    state.sort === field
      ? "ascending"
      : state.sort === `-${field}`
        ? "descending"
        : undefined;
  const href = listHref(collection, {
    ...state,
    sort: sortAfter(state, field),
    page: 1,
  });
  return (
    <th scope="col" aria-sort={direction}>
      <Link href={href} className="admin-sort" scroll={false}>
        {label}
        <span aria-hidden="true">
          {direction === "ascending"
            ? " ▲"
            : direction === "descending"
              ? " ▼"
              : ""}
        </span>
        <span className="admin-visually-hidden">
          {direction ? `, sorted ${direction}` : ", sort by this column"}
        </span>
      </Link>
    </th>
  );
}

function filterValue(state: ListState, field: string): FilterValue | undefined {
  return state.filters.find((filter) => filter.field === field);
}

function FilterControl({
  collection,
  field,
  state,
}: {
  collection: AdminCollection;
  field: string;
  state: ListState;
}) {
  const list = ADMIN_LISTS[collection];
  const kind = list.filters[field];
  const definition = list.fields[field];
  const current = filterValue(state, field);
  const label = fieldLabel(collection, field);
  const id = `filter-${field}`;
  const value = current && current.kind !== "dates" ? current.value : "";

  if (kind === "dates") {
    const dates = current?.kind === "dates" ? current : undefined;
    return (
      <fieldset className="admin-filter dates">
        <legend>{label}</legend>
        <label htmlFor={`${id}-from`}>From</label>
        <input
          id={`${id}-from`}
          className="admin-input"
          type="date"
          name={`${field}.from`}
          defaultValue={dates?.from}
        />
        <label htmlFor={`${id}-to`}>To</label>
        <input
          id={`${id}-to`}
          className="admin-input"
          type="date"
          name={`${field}.to`}
          defaultValue={dates?.to}
        />
      </fieldset>
    );
  }
  if (kind === "equals" || kind === "exists") {
    const options =
      kind === "equals" && definition?.kind === "select"
        ? definition.values.map((option) => ({
            value: option,
            label: valueLabel(collection, field, option),
          }))
        : [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
          ];
    return (
      <div className="admin-filter">
        <label htmlFor={id}>{label}</label>
        <select
          id={id}
          className="admin-input"
          name={field}
          defaultValue={value}
        >
          <option value="">Any</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }
  return (
    <div className="admin-filter">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className="admin-input"
        type="text"
        name={field}
        defaultValue={value}
        placeholder={
          kind === "related" ? "Title, or the record's id" : undefined
        }
      />
    </div>
  );
}

function Filters({
  collection,
  state,
}: {
  collection: AdminCollection;
  state: ListState;
}) {
  const fields = Object.keys(ADMIN_LISTS[collection].filters);
  if (fields.length === 0) return null;
  const active = state.filters.length;
  const list = ADMIN_LISTS[collection];
  return (
    <details className="admin-filters" open={active > 0}>
      <summary>Filters{active > 0 ? ` (${active} in use)` : ""}</summary>
      <FilterForm className="admin-filter-form">
        {state.search && (
          <input type="hidden" name="search" value={state.search} />
        )}
        {state.sort !== list.defaultSort && (
          <input type="hidden" name="sort" value={state.sort} />
        )}
        {state.limit !== list.defaultLimit && (
          <input type="hidden" name="limit" value={state.limit} />
        )}
        <div className="admin-filter-grid">
          {fields.map((field) => (
            <FilterControl
              key={field}
              collection={collection}
              field={field}
              state={state}
            />
          ))}
        </div>
        <div className="admin-row">
          <button type="submit" className="admin-button">
            Apply filters
          </button>
          {active > 0 && (
            <Link
              href={listHref(collection, { ...state, filters: [], page: 1 })}
            >
              Clear filters
            </Link>
          )}
        </div>
      </FilterForm>
    </details>
  );
}

/** Page numbers to offer: the first, the last, and two either side. */
function pageNumbers(page: number, total: number): (number | "gap")[] {
  const wanted = new Set([
    1,
    total,
    page - 2,
    page - 1,
    page,
    page + 1,
    page + 2,
  ]);
  const pages = [...wanted]
    .filter((n) => n >= 1 && n <= total)
    .sort((a, b) => a - b);
  const result: (number | "gap")[] = [];
  for (const n of pages) {
    const last = result.at(-1);
    if (typeof last === "number" && n - last > 1) result.push("gap");
    result.push(n);
  }
  return result;
}

function Pages({
  collection,
  state,
  page,
}: {
  collection: AdminCollection;
  state: ListState;
  page: AdminPage;
}) {
  const first = page.totalDocs === 0 ? 0 : (page.page - 1) * page.limit + 1;
  const last = Math.min(page.page * page.limit, page.totalDocs);
  const at = (n: number) => listHref(collection, { ...state, page: n });
  return (
    <div className="admin-pages">
      <p className="admin-muted" aria-live="polite">
        {page.totalDocs === 0
          ? "Nothing to show"
          : `${first}–${last} of ${page.totalDocs}`}
      </p>
      {page.totalPages > 1 && (
        <nav aria-label="Pages">
          <ul>
            <li>
              {page.hasPrevPage ? (
                <Link href={at(page.page - 1)} rel="prev">
                  Previous
                </Link>
              ) : (
                <span className="admin-none">Previous</span>
              )}
            </li>
            {pageNumbers(page.page, page.totalPages).map((n, index) =>
              n === "gap" ? (
                <li key={`gap-${index}`} aria-hidden="true">
                  …
                </li>
              ) : (
                <li key={n}>
                  {n === page.page ? (
                    <span aria-current="page">{n}</span>
                  ) : (
                    <Link href={at(n)} aria-label={`Page ${n}`}>
                      {n}
                    </Link>
                  )}
                </li>
              ),
            )}
            <li>
              {page.hasNextPage ? (
                <Link href={at(page.page + 1)} rel="next">
                  Next
                </Link>
              ) : (
                <span className="admin-none">Next</span>
              )}
            </li>
          </ul>
        </nav>
      )}
      <p className="admin-limits">
        <span className="admin-muted">Per page:</span>
        {ADMIN_LIST_LIMITS.map((limit) =>
          limit === state.limit ? (
            <span key={limit} aria-current="true">
              {limit}
            </span>
          ) : (
            <Link
              key={limit}
              href={listHref(collection, { ...state, limit, page: 1 })}
              aria-label={`${limit} per page`}
            >
              {limit}
            </Link>
          ),
        )}
      </p>
    </div>
  );
}

/** The parameters the search box keeps while it changes the search. */
function keptParams(
  collection: AdminCollection,
  state: ListState,
): Record<string, string> {
  const href = listHref(collection, { ...state, search: "", page: 1 });
  return Object.fromEntries(new URL(href, "http://admin").searchParams);
}

export function ListView({
  collection,
  state,
  page,
  capped,
  notice,
  createHref,
}: {
  collection: AdminCollection;
  state: ListState;
  page: AdminPage;
  capped: string[];
  notice?: ReactNode;
  /** Where a new record is made, for those who may make one. */
  createHref?: string;
}) {
  const text = COLLECTION_TEXT[collection];
  const list = ADMIN_LISTS[collection];
  const searchNames = list.search.map((field) => fieldLabel(collection, field));
  return (
    <section className="admin-stack">
      <header className="admin-list-header">
        <div className="admin-title-row">
          <h1>{text.plural}</h1>
          {createHref && (
            <Link href={createHref} className="admin-button">
              Create new
            </Link>
          )}
        </div>
        {text.description && <p className="admin-muted">{text.description}</p>}
      </header>
      {notice}
      <SearchBox
        key={collection}
        placeholder={`Search by ${searchNames.join(", ")}`}
        value={state.search}
        kept={keptParams(collection, state)}
      />
      <Filters
        key={listHref(collection, { ...state, page: 1 })}
        collection={collection}
        state={state}
      />
      {capped.length > 0 && (
        <p className="admin-notice">
          {capped.map((field) => fieldLabel(collection, field)).join(" and ")}:
          more than {ADMIN_RELATED_MATCHES_MAX} records matched by title, so
          only the first {ADMIN_RELATED_MATCHES_MAX} are used. Type more of the
          title, or the record&apos;s id.
        </p>
      )}
      {page.docs.length === 0 ? (
        <div className="admin-card">
          <p>
            {state.search || state.filters.length > 0
              ? `No ${text.plural.toLowerCase()} match.`
              : `There are no ${text.plural.toLowerCase()} yet.`}
          </p>
          {(state.search || state.filters.length > 0 || state.page > 1) && (
            <p>
              <Link href={`/admin/collections/${collection}`}>
                Show all {text.plural.toLowerCase()}
              </Link>
            </p>
          )}
        </div>
      ) : (
        <div
          className="admin-table-wrap"
          role="region"
          aria-label={text.plural}
          tabIndex={0}
        >
          <table className="admin-table">
            <thead>
              <tr>
                {list.columns.map((field) => (
                  <SortHeader
                    key={field}
                    collection={collection}
                    field={field}
                    state={state}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {page.docs.map((row) => (
                <tr key={row.id}>
                  {list.columns.map((field, index) => (
                    <Cell
                      key={field}
                      collection={collection}
                      field={field}
                      row={row}
                      isFirst={index === 0}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pages collection={collection} state={state} page={page} />
    </section>
  );
}
