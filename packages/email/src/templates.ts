import type { EmailMessage } from "./sender.ts";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) => HTML_ESCAPES[character] ?? character,
  );
}

export type MagicLinkEmail = {
  to: string;
  url: string;
  expiresInMinutes: number;
};

export function magicLinkEmail({
  to,
  url,
  expiresInMinutes,
}: MagicLinkEmail): EmailMessage {
  const safeUrl = escapeHtml(url);
  return {
    to,
    subject: "Your Country Topics sign-in link",
    text: [
      "Use this link to sign in to Country Topics:",
      "",
      url,
      "",
      `It works once and expires in ${expiresInMinutes} minutes.`,
      "If you did not ask to sign in, you can ignore this email.",
    ].join("\n"),
    html: [
      "<p>Use this link to sign in to Country Topics:</p>",
      `<p><a href="${safeUrl}">Sign in to Country Topics</a></p>`,
      `<p>It works once and expires in ${expiresInMinutes} minutes.</p>`,
      "<p>If you did not ask to sign in, you can ignore this email.</p>",
    ].join("\n"),
  };
}
