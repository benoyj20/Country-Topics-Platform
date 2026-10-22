// What changed between two versions' text (ADR 0014, phase 11), as
// Payload's panel shows it when comparing versions: line by line, and word
// by word within a line that changed. Runs in the browser, where the
// comparison is drawn.

export type DiffPart = { kind: "same" | "added" | "removed"; text: string };

/**
 * Longer inputs than this many token pairs are compared whole, as removed
 * and added: the table below grows with their product.
 */
const MAX_CELLS = 4_000_000;

/** The longest common subsequence of `before` and `after`, as parts. */
function diffTokens(
  before: readonly string[],
  after: readonly string[],
): DiffPart[] {
  const rows = before.length;
  const cols = after.length;
  if (rows * cols > MAX_CELLS) {
    return [
      ...before.map((text) => ({ kind: "removed" as const, text })),
      ...after.map((text) => ({ kind: "added" as const, text })),
    ];
  }
  // lengths[i][j]: the common subsequence of before[i..] and after[j..].
  const width = cols + 1;
  const lengths = new Uint32Array((rows + 1) * width);
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      lengths[i * width + j] =
        before[i] === after[j]
          ? (lengths[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(
              lengths[(i + 1) * width + j] ?? 0,
              lengths[i * width + j + 1] ?? 0,
            );
    }
  }
  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (before[i] === after[j]) {
      parts.push({ kind: "same", text: before[i] ?? "" });
      i++;
      j++;
    } else if (
      (lengths[(i + 1) * width + j] ?? 0) >= (lengths[i * width + j + 1] ?? 0)
    ) {
      parts.push({ kind: "removed", text: before[i] ?? "" });
      i++;
    } else {
      parts.push({ kind: "added", text: after[j] ?? "" });
      j++;
    }
  }
  for (; i < rows; i++) parts.push({ kind: "removed", text: before[i] ?? "" });
  for (; j < cols; j++) parts.push({ kind: "added", text: after[j] ?? "" });
  return parts;
}

/** Words and the spaces between them, kept, so the parts join back up. */
function words(line: string): string[] {
  return line.split(/(\s+)/).filter((token) => token !== "");
}

/** Joins neighbouring parts of the same kind. */
function merged(parts: readonly DiffPart[]): DiffPart[] {
  const out: DiffPart[] = [];
  for (const part of parts) {
    const last = out.at(-1);
    if (last && last.kind === part.kind) last.text += part.text;
    else if (part.text) out.push({ ...part });
  }
  return out;
}

/**
 * The differences between two texts: whole lines where lines were added or
 * removed, and words within a changed line. Lines end with "\n" in the
 * parts, so each side's text is its parts joined.
 */
export function textDiff(before: string, after: string): DiffPart[] {
  if (before === after) return before ? [{ kind: "same", text: before }] : [];
  const lines = diffTokens(
    before ? before.split("\n") : [],
    after ? after.split("\n") : [],
  );
  const parts: DiffPart[] = [];
  let at = 0;
  while (at < lines.length) {
    const line = lines[at];
    if (!line) break;
    if (line.kind === "same") {
      parts.push({ kind: "same", text: `${line.text}\n` });
      at++;
      continue;
    }
    // A run of changed lines: the removed paired with the added, word by
    // word, and whatever is left over whole.
    const removed: string[] = [];
    const added: string[] = [];
    while (at < lines.length && lines[at]?.kind !== "same") {
      const changed = lines[at];
      if (changed?.kind === "removed") removed.push(changed.text);
      else if (changed) added.push(changed.text);
      at++;
    }
    const paired = Math.min(removed.length, added.length);
    for (let n = 0; n < paired; n++) {
      parts.push(
        ...diffTokens(words(removed[n] ?? ""), words(added[n] ?? "")),
        { kind: "same", text: "\n" },
      );
    }
    for (const text of removed.slice(paired)) {
      parts.push({ kind: "removed", text: `${text}\n` });
    }
    for (const text of added.slice(paired)) {
      parts.push({ kind: "added", text: `${text}\n` });
    }
  }
  // The last line's own "\n" was added above; the texts had none.
  const last = parts.at(-1);
  if (last?.text.endsWith("\n")) last.text = last.text.slice(0, -1);
  return merged(parts);
}

/** One side of a diff: what the earlier version had, or the later one. */
export function side(
  parts: readonly DiffPart[],
  which: "before" | "after",
): DiffPart[] {
  const hidden = which === "before" ? "added" : "removed";
  const shown = merged(parts.filter((part) => part.kind !== hidden));
  // A line the other side added after it leaves this side's last "\n".
  const last = shown.at(-1);
  if (last?.text.endsWith("\n")) {
    last.text = last.text.slice(0, -1);
    if (!last.text) shown.pop();
  }
  return shown;
}
