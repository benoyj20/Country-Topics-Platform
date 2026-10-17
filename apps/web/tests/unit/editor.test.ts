import { describe, expect, it } from "vitest";

import { isAllowedLinkUrl, richTextHasText, richTextLinksTo } from "@/editor";

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

describe("richTextLinksTo", () => {
  const link = (fields: Record<string, unknown>) => ({
    type: "paragraph",
    children: [
      { type: "link", fields, children: [{ type: "text", text: "x" }] },
    ],
  });

  it("finds internal links to the collection, however deep", () => {
    const toPerson = link({
      linkType: "internal",
      doc: { relationTo: "individuals", value: "person-id" },
    });
    expect(richTextLinksTo(doc(toPerson), "individuals")).toBe(true);
    expect(
      richTextLinksTo(
        doc({ type: "quote", children: [toPerson] }),
        "individuals",
      ),
    ).toBe(true);
  });

  it("ignores links elsewhere and plain text", () => {
    expect(
      richTextLinksTo(
        doc(
          link({
            linkType: "internal",
            doc: { relationTo: "topics", value: "topic-id" },
          }),
          link({ linkType: "custom", url: "https://example.org/individuals" }),
          paragraph("individuals"),
        ),
        "individuals",
      ),
    ).toBe(false);
    expect(richTextLinksTo(null, "individuals")).toBe(false);
  });
});
