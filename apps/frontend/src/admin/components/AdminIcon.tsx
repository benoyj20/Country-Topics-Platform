import type { AdminCollection } from "@countrytopics/contracts";

// The admin's icons: simple line drawings on a 24-unit grid, drawn in the
// text's colour so they follow the theme. Decorative: the text beside each
// one says what it is.

type IconName =
  | AdminCollection
  | "dashboard"
  | "external"
  | "plus"
  | "review"
  | "report"
  | "inbox"
  | "arrow";

const PATHS: Record<IconName, string> = {
  dashboard: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  topics: "M6 3h9l4 4v14H6zM15 3v4h4M9 12h7M9 16h7M9 8h3",
  "topic-changes": "M12 7v5l3 2M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4",
  references: "M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h10",
  snippets: "M4 6h12v12H4zM16 10l4-2v8l-4-2",
  videos: "M3 5h18v14H3zM10 9l5 3-5 3z",
  media: "M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15 9.5a1.5 1.5 0 1 0 0-.01",
  "link-archives":
    "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  individuals: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21a8 8 0 0 1 16 0",
  countries:
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3",
  categories: "M3 7l9-4 9 4-9 4zM3 12l9 4 9-4M3 17l9 4 9-4",
  tags: "M3 12V4h8l10 10-8 8zM7.5 8.5h.01",
  comments: "M4 5h16v11H9l-5 4z",
  "comment-reports": "M5 21V4M5 4h11l-2 4 2 4H5",
  users:
    "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6.5 6.5 0 0 1 3.5 6",
  invitations: "M3 6h18v12H3zM3 7l9 6 9-6",
  feedback: "M4 4h16v12H8l-4 4zM8 9h8M8 12h5",
  "audit-log": "M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6zM9 12l2 2 4-4",
  external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  plus: "M12 5v14M5 12h14",
  review: "M4 12l5 5L20 6",
  report: "M12 3l9 16H3zM12 10v4M12 17h.01",
  inbox: "M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6H3v-6z",
  arrow: "M5 12h14M13 6l6 6-6 6",
};

export function AdminIcon({
  name,
  className = "admin-icon",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
