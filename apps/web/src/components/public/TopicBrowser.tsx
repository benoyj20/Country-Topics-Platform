"use client";

import type { TopicSort } from "@countrytopics/search/topic-search";
import { useSearchParams } from "next/navigation";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import {
  type BrowseQuery,
  browseSearchParams,
  defaultSort,
  EMPTY_BROWSE_QUERY,
  effectiveSort,
  filterCount,
  type ListKey,
  parseBrowseQuery,
} from "@/public/browse-query";
import { formatDate } from "@/public/format";
import type {
  BrowseFacetValue,
  BrowseResult,
  BrowseTopic,
} from "@/public/types";

import styles from "./browse.module.css";
import publicStyles from "./public.module.css";
import { TopicList } from "./TopicList";

// F1 browsing (ADR 0008). The URL is the whole state: every filter, the
// search words, and the sort are in it, so a link opens the same results
// anywhere. The page itself is the same for everyone and cached; results
// come from /api/v1/topics with the same parameters. The address changes
// through the browser's history API, which Next.js passes to
// useSearchParams without asking the server for the page again.

const SORT_LABELS: Record<TopicSort, string> = {
  relevance: "Best match",
  newest: "Newest",
  updated: "Recently updated",
  referenced: "Most referenced",
  discussed: "Most discussed",
};

const FACETS: { key: ListKey; title: string; grouped?: boolean }[] = [
  { key: "country", title: "Countries", grouped: true },
  { key: "category", title: "Category" },
  { key: "tag", title: "Tags" },
  { key: "person", title: "People" },
  { key: "evidence", title: "Evidence" },
  { key: "language", title: "Snippet language" },
];

/** Wide enough to show the filters open beside nothing else on the line. */
const WIDE_SCREEN = "(min-width: 48rem)";

function onScreenChange(notify: () => void): () => void {
  const query = window.matchMedia(WIDE_SCREEN);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

/**
 * Whether the screen is wide. The server cannot know, so it renders the
 * filters folded; React hydrates with that and then uses the real width,
 * where reading it during the first render would make the server's HTML
 * and the browser's disagree.
 */
function useWideScreen(): boolean {
  return useSyncExternalStore(
    onScreenChange,
    () => window.matchMedia(WIDE_SCREEN).matches,
    () => false,
  );
}

async function fetchPage(
  search: string,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<BrowseResult> {
  const params = new URLSearchParams(search);
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(`/api/v1/topics?${params}`, { signal });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String(body.error)
        : "The topics could not be loaded.";
    throw new Error(message);
  }
  // The site's own API, answering with BrowseResult.
  return body as BrowseResult;
}

function pageHref(query: BrowseQuery): string {
  const search = browseSearchParams(query).toString();
  return search ? `/topics?${search}` : "/topics";
}

/** "1 topic", "12 topics". */
function topicCount(total: number): string {
  return `${total} ${total === 1 ? "topic" : "topics"}`;
}

export function TopicBrowser() {
  const searchParams = useSearchParams();
  const { query, problems } = useMemo(
    () => parseBrowseQuery(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const search = browseSearchParams(query).toString();

  // What was wrong with the link as opened, until the visitor changes
  // something; the address itself is corrected to what is shown.
  const [linkProblems, setLinkProblems] = useState(problems);
  // Open on wide screens and folded on narrow ones, until the visitor
  // opens or folds them.
  const wide = useWideScreen();
  const [filtersToggled, setFiltersOpen] = useState<boolean>();
  const filtersOpen = filtersToggled ?? wide;
  const [results, setResults] = useState<{ search: string } & BrowseResult>();
  const [failure, setFailure] = useState<{ search: string; message: string }>();
  const [attempt, setAttempt] = useState(0);
  const [more, setMore] = useState<"idle" | "loading" | "failed">("idle");
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (searchParams.toString() !== search) {
      window.history.replaceState(null, "", pageHref(query));
    }
  }, [query, search, searchParams]);

  useEffect(() => {
    const controller = new AbortController();
    fetchPage(search, null, controller.signal).then(
      (page) => {
        setResults({ search, ...page });
        setMore("idle");
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setFailure({
          search,
          message:
            error instanceof Error
              ? error.message
              : "The topics could not be loaded.",
        });
      },
    );
    return () => controller.abort();
  }, [search, attempt]);

  const current = results?.search === search ? results : undefined;
  const failed = failure?.search === search && !current ? failure : undefined;
  // Facets and results from the last request stay while the next loads.
  const facets = results?.facets ?? null;
  const loading = !current && !failed;

  /**
   * Changes the request, starting from the address as it is now: Next.js
   * passes a new address to useSearchParams a render later, so clicks in
   * quick succession must not each start from the same rendered query.
   * Filters replace the address; a new search adds to the history.
   */
  function change(
    edit: (previous: BrowseQuery) => BrowseQuery,
    history: "replace" | "push" = "replace",
  ) {
    const previous = parseBrowseQuery(
      new URLSearchParams(window.location.search),
    ).query;
    const href = pageHref(edit(previous));
    setLinkProblems([]);
    setCopy("idle");
    if (history === "push") window.history.pushState(null, "", href);
    else window.history.replaceState(null, "", href);
  }

  function toggle(key: ListKey, value: string) {
    change((previous) => {
      const chosen = previous[key] as string[];
      return {
        ...previous,
        [key]: chosen.includes(value)
          ? chosen.filter((item) => item !== value)
          : [...chosen, value],
      };
    });
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const words = new FormData(event.currentTarget).get("q");
    const q =
      typeof words === "string" ? words.replace(/\s+/g, " ").trim() : "";
    change((previous) => ({ ...previous, q: q || null }), "push");
  }

  async function loadMore() {
    if (!current?.nextCursor) return;
    setMore("loading");
    try {
      const page = await fetchPage(search, current.nextCursor);
      setResults((previous) =>
        previous?.search === search
          ? {
              ...previous,
              topics: [...previous.topics, ...page.topics],
              nextCursor: page.nextCursor,
            }
          : previous,
      );
      setMore("idle");
    } catch {
      setMore("failed");
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  const labelOf = (key: ListKey, value: string): string =>
    facets?.[key].find((item) => item.value === value)?.label ?? value;
  const chosenCount = filterCount(query);
  const sort = effectiveSort(query);
  const shown: BrowseTopic[] = (current ?? results)?.topics ?? [];

  return (
    <div className="stack">
      <form role="search" className={styles.search} onSubmit={submitSearch}>
        <label htmlFor="browse-q" className={publicStyles.visuallyHidden}>
          Search topics
        </label>
        <input
          // A new value from the URL (back, a link) replaces what was typed.
          key={query.q ?? ""}
          id="browse-q"
          name="q"
          type="search"
          defaultValue={query.q ?? ""}
          maxLength={200}
          placeholder="Search topics, people, and what they said"
        />
        <button type="submit" className="button">
          Search
        </button>
      </form>

      {linkProblems.length > 0 ? (
        <div className="notice" role="status">
          <p className={styles.flush}>
            Part of this link could not be used, so it was left out:
          </p>
          <ul>
            {linkProblems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <details
        className={styles.filters}
        open={filtersOpen}
        onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
      >
        <summary>Filters{chosenCount > 0 ? ` (${chosenCount})` : ""}</summary>
        <div className={styles.facets}>
          {FACETS.map(({ key, title, grouped }) => (
            <Facet
              key={key}
              title={title}
              values={facets?.[key] ?? []}
              chosen={query[key] as string[]}
              grouped={grouped}
              onToggle={(value) => toggle(key, value)}
            />
          ))}
          <fieldset className={styles.facet}>
            <legend>References</legend>
            <label className={styles.option}>
              <input
                type="checkbox"
                checked={query.references}
                onChange={() =>
                  change((previous) => ({
                    ...previous,
                    references: !previous.references,
                  }))
                }
              />
              Cites a reference
              {facets ? (
                <span className={styles.count}>({facets.references})</span>
              ) : null}
            </label>
          </fieldset>
          <fieldset className={styles.facet}>
            <legend>First published</legend>
            <div className={styles.dates}>
              <label>
                From
                <input
                  type="date"
                  value={query.from ?? ""}
                  max={query.to ?? undefined}
                  onChange={(event) =>
                    change((previous) => {
                      // The date just chosen wins over one it contradicts.
                      const from = event.target.value || null;
                      const clash = from && previous.to && from > previous.to;
                      return {
                        ...previous,
                        from,
                        to: clash ? null : previous.to,
                      };
                    })
                  }
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={query.to ?? ""}
                  min={query.from ?? undefined}
                  onChange={(event) =>
                    change((previous) => {
                      const to = event.target.value || null;
                      const clash = to && previous.from && previous.from > to;
                      return {
                        ...previous,
                        to,
                        from: clash ? null : previous.from,
                      };
                    })
                  }
                />
              </label>
            </div>
          </fieldset>
        </div>
      </details>

      {chosenCount > 0 || query.q ? (
        <ul className={styles.chosen} aria-label="Chosen filters">
          {query.q ? (
            <li>
              <button
                type="button"
                className={styles.chip}
                aria-label={`Remove the search for ${query.q}`}
                onClick={() => change((previous) => ({ ...previous, q: null }))}
              >
                “{query.q}” <span aria-hidden="true">×</span>
              </button>
            </li>
          ) : null}
          {FACETS.flatMap(({ key }) =>
            (query[key] as string[]).map((value) => (
              <li key={`${key}:${value}`}>
                <button
                  type="button"
                  className={styles.chip}
                  aria-label={`Remove ${labelOf(key, value)}`}
                  onClick={() => toggle(key, value)}
                >
                  {labelOf(key, value)} <span aria-hidden="true">×</span>
                </button>
              </li>
            )),
          )}
          {query.references ? (
            <li>
              <button
                type="button"
                className={styles.chip}
                aria-label="Remove: cites a reference"
                onClick={() =>
                  change((previous) => ({ ...previous, references: false }))
                }
              >
                Cites a reference <span aria-hidden="true">×</span>
              </button>
            </li>
          ) : null}
          {(["from", "to"] as const).map((key) =>
            query[key] ? (
              <li key={key}>
                <button
                  type="button"
                  className={styles.chip}
                  aria-label={`Remove the date ${key} ${formatDate(`${query[key]}T00:00:00Z`)}`}
                  onClick={() =>
                    change((previous) => ({ ...previous, [key]: null }))
                  }
                >
                  {key === "from" ? "From" : "To"}{" "}
                  {formatDate(`${query[key]}T00:00:00Z`)}{" "}
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ) : null,
          )}
          <li>
            <button
              type="button"
              className={styles.clear}
              onClick={() => change(() => EMPTY_BROWSE_QUERY)}
            >
              Clear all
            </button>
          </li>
        </ul>
      ) : null}

      <div className={styles.toolbar}>
        <p className={styles.total} aria-live="polite">
          {failed
            ? "Could not load topics"
            : typeof current?.total === "number"
              ? topicCount(current.total)
              : "Loading topics…"}
        </p>
        <label className={styles.sort}>
          Sort by
          <select
            value={sort}
            onChange={(event) => {
              const value = event.target.value as TopicSort;
              change((previous) => ({
                ...previous,
                sort: value === defaultSort(previous) ? null : value,
              }));
            }}
          >
            {(Object.keys(SORT_LABELS) as TopicSort[])
              .filter((option) => option !== "relevance" || query.q)
              .map((option) => (
                <option key={option} value={option}>
                  {SORT_LABELS[option]}
                </option>
              ))}
          </select>
        </label>
        <button type="button" className="button secondary" onClick={copyLink}>
          Copy link
        </button>
        <span role="status" className={styles.copied}>
          {copy === "copied" ? "Link copied." : null}
        </span>
      </div>
      {copy === "failed" ? (
        <label className={styles.copyField}>
          Your browser did not allow copying; copy this link instead:
          <input
            type="text"
            readOnly
            value={typeof window === "undefined" ? "" : window.location.href}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      ) : null}

      {failed ? (
        <div className="notice" role="alert">
          <p className={styles.flush}>{failed.message}</p>
          <button
            type="button"
            className="button secondary"
            onClick={() => {
              setFailure(undefined);
              setAttempt((count) => count + 1);
            }}
          >
            Try again
          </button>
        </div>
      ) : (
        <div aria-busy={loading} className={loading ? styles.stale : undefined}>
          {loading && shown.length === 0 ? null : (
            <TopicList
              topics={{ items: shown, more: false }}
              empty={
                chosenCount > 0 || query.q
                  ? "No topics match. Try other words or fewer filters."
                  : "No topics are published yet."
              }
            />
          )}
        </div>
      )}

      {current?.nextCursor ? (
        <div className={styles.more}>
          <button
            type="button"
            className="button secondary"
            onClick={loadMore}
            disabled={more === "loading"}
          >
            {more === "loading" ? "Loading…" : "Show more topics"}
          </button>
          {more === "failed" ? (
            <p role="alert" className={styles.flush}>
              More topics could not be loaded. Try again.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Facet({
  title,
  values,
  chosen,
  grouped = false,
  onToggle,
}: {
  title: string;
  values: BrowseFacetValue[];
  chosen: string[];
  grouped?: boolean;
  onToggle: (value: string) => void;
}) {
  // Values no topic has left are hidden unless chosen.
  const listed = values.filter(
    (item) => item.count !== 0 || chosen.includes(item.value),
  );
  if (listed.length === 0) return null;
  const groups = new Map<string, BrowseFacetValue[]>();
  for (const item of listed) {
    const group = grouped ? (item.group ?? "Other") : "";
    groups.set(group, [...(groups.get(group) ?? []), item]);
  }
  return (
    <fieldset className={styles.facet}>
      <legend>{title}</legend>
      {[...groups]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([group, items]) => (
          <div key={group}>
            {group ? <p className={styles.group}>{group}</p> : null}
            <ul className={styles.options}>
              {items.map((item) => (
                <li key={item.value}>
                  <label className={styles.option}>
                    <input
                      type="checkbox"
                      checked={chosen.includes(item.value)}
                      onChange={() => onToggle(item.value)}
                    />
                    {item.label}
                    {item.count !== null ? (
                      <span className={styles.count}>({item.count})</span>
                    ) : null}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </fieldset>
  );
}
