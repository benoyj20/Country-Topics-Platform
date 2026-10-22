import type { ReactNode } from "react";

// Line icons for the public pages. Decorative: the text beside each says
// what it means.

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function VideoIcon() {
  return (
    <Icon>
      <rect x="2.5" y="5" width="14" height="14" rx="2.5" />
      <path d="m16.5 10 5-3v10l-5-3" />
    </Icon>
  );
}

export function DocumentIcon() {
  return (
    <Icon>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </Icon>
  );
}

export function LinkIcon() {
  return (
    <Icon>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </Icon>
  );
}

export function ImageIcon() {
  return (
    <Icon>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="9" cy="10" r="1.75" />
      <path d="m21 16-5-5-9 9" />
    </Icon>
  );
}

export function BookIcon() {
  return (
    <Icon>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z" />
      <path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />
    </Icon>
  );
}

/** A wireframe globe, drawn large and faint behind the home page's hero. */
export function GlobeArt({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 200 200"
      fill="none"
      stroke="#fff"
      strokeWidth="1.2"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="100" cy="100" r="96" />
      <ellipse cx="100" cy="100" rx="24" ry="96" />
      <ellipse cx="100" cy="100" rx="52" ry="96" />
      <ellipse cx="100" cy="100" rx="78" ry="96" />
      <path d="M4 100h192" />
      <path d="M14 56h172M14 144h172" />
      <path d="M40 24h120M40 176h120" />
    </svg>
  );
}
