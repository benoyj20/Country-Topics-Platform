import { useId } from "react";

/**
 * The site's mark: a globe on a blue tile. Decorative; the link around it
 * carries the site's name. The browser tab's icon, app/(frontend)/icon.svg,
 * is the same drawing: change both together.
 */
export function Logo() {
  // Unique per use, as the mark appears in the header and the footer.
  const gradient = `logo-fill-${useId()}`;
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2f63e6" />
          <stop offset="1" stopColor="#0b2545" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${gradient})`} />
      <g
        fill="none"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="16" cy="16" r="8.5" />
        <ellipse cx="16" cy="16" rx="3.6" ry="8.5" />
        <path d="M8.1 13.2h15.8M8.1 18.8h15.8" />
      </g>
    </svg>
  );
}
