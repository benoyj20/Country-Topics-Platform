import { describe, expect, it } from "vitest";

import { isAllowedLinkUrl, richTextHasText } from "@/editor";

const doc = (...children: unknown[]) => ({ root: { type: "root", children } });
const paragraph = (text: string) => ({
  type: "paragraph",
  children: [{ type: "text", text }],
});

describe("richTextHasText", () => {
  it("finds text anywhere in the document", () => {
    expect(richTextHasText(doc(paragraph("Hello")))).toBe(true);
    expect(
      richTextHasText(
        doc({
          type: "list",
          children: [
            { type: "listitem", children: [{ type: "text", text: "Item" }] },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("treats empty and blank documents as empty", () => {
    expect(richTextHasText(null)).toBe(false);
    expect(richTextHasText(doc())).toBe(false);
    expect(richTextHasText(doc(paragraph("  \n ")))).toBe(false);
    expect(richTextHasText({})).toBe(false);
  });
});

describe("isAllowedLinkUrl", () => {
  it("allows web pages and email only", () => {
    expect(isAllowedLinkUrl("https://example.org/report")).toBe(true);
    expect(isAllowedLinkUrl("http://example.org")).toBe(true);
    expect(isAllowedLinkUrl("mailto:someone@example.org")).toBe(true);
    expect(isAllowedLinkUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedLinkUrl("data:text/html,hi")).toBe(false);
    expect(isAllowedLinkUrl("/relative")).toBe(false);
  });
});
