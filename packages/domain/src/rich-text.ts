type LexicalNode = { type?: unknown; text?: unknown; children?: unknown };

/** Deeper documents are cut off here rather than risking the stack. */
const MAX_DEPTH = 64;

/**
 * The words of a Lexical rich-text document (a topic's body), for search:
 * text nodes in order, with block nodes (paragraphs, headings, list items)
 * separated by line breaks so words from different blocks never run
 * together. Link targets and formatting are left out. Anything that is not a
 * Lexical document gives "".
 */
export function richTextPlainText(value: unknown): string {
  const root = (value as { root?: LexicalNode } | null | undefined)?.root;
  if (!root || typeof root !== "object") return "";
  const parts: string[] = [];
  const visit = (node: LexicalNode, depth: number): void => {
    if (typeof node.text === "string") parts.push(node.text);
    else if (node.type === "linebreak" || node.type === "tab") parts.push(" ");
    if (depth >= MAX_DEPTH || !Array.isArray(node.children)) return;
    for (const child of node.children as unknown[]) {
      if (child && typeof child === "object") {
        visit(child as LexicalNode, depth + 1);
      }
    }
    // Inline nodes (text, links) sit inside blocks; a block ends a line.
    if (node.type !== "link" && node.type !== "autolink" && depth > 0) {
      parts.push("\n");
    }
  };
  visit(root, 0);
  return parts
    .join("")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}
