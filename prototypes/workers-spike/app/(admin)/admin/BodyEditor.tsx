"use client";

import {
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from "@lexical/list";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import {
  $createHeadingNode,
  $createQuoteNode,
  type HeadingTagType,
} from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  FORMAT_TEXT_COMMAND,
  type LexicalEditor,
  type SerializedEditorState,
  type TextFormatType,
} from "lexical";
import type { RefObject } from "react";

import {
  $createHorizontalRuleNode,
  $linkSelection,
  $unlinkSelection,
  BODY_NODES,
} from "./body-nodes";

// The topic body's editor, loaded in the browser only (next/dynamic with
// ssr: false), so neither the Worker nor the public pages carry it
// (ADR 0014, "Heavy parts load in the browser"). A spike's toolbar: the
// formats and blocks apps/web's editor allows, and external links.

const THEME = {
  heading: { h2: "editor-h2", h3: "editor-h3", h4: "editor-h4" },
  quote: "editor-quote",
  list: {
    ul: "editor-ul",
    ol: "editor-ol",
    nested: { listitem: "editor-nested" },
  },
  link: "editor-link",
  hr: "editor-hr",
  text: {
    underline: "editor-underline",
    strikethrough: "editor-strikethrough",
    underlineStrikethrough: "editor-underline-strikethrough",
  },
};

/** External links in rich text: web pages and email only (apps/web). */
function isAllowedLinkUrl(value: string): boolean {
  try {
    return ["https:", "http:", "mailto:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function setBlock(
  editor: LexicalEditor,
  block: "p" | "quote" | HeadingTagType,
) {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    $setBlocksType(selection, () =>
      block === "p"
        ? $createParagraphNode()
        : block === "quote"
          ? $createQuoteNode()
          : $createHeadingNode(block),
    );
  });
}

function Toolbar() {
  const [editor] = useLexicalComposerContext();
  const format = (type: TextFormatType) =>
    editor.dispatchCommand(FORMAT_TEXT_COMMAND, type);
  const link = () => {
    const url = window.prompt("Link to (https://, http://, or mailto:)");
    if (url === null) return;
    if (!isAllowedLinkUrl(url.trim())) {
      window.alert(
        "Enter a full link starting with https://, http://, or mailto:.",
      );
      return;
    }
    editor.update(() => $linkSelection(url.trim()));
  };
  const buttons: [string, string, () => void][] = [
    ["B", "Bold", () => format("bold")],
    ["I", "Italic", () => format("italic")],
    ["U", "Underline", () => format("underline")],
    ["S", "Strikethrough", () => format("strikethrough")],
    ["¶", "Paragraph", () => setBlock(editor, "p")],
    ["H2", "Heading 2", () => setBlock(editor, "h2")],
    ["H3", "Heading 3", () => setBlock(editor, "h3")],
    ["H4", "Heading 4", () => setBlock(editor, "h4")],
    ["“”", "Quote", () => setBlock(editor, "quote")],
    [
      "•",
      "Bulleted list",
      () => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined),
    ],
    [
      "1.",
      "Numbered list",
      () => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined),
    ],
    [
      "—",
      "Horizontal rule",
      () =>
        editor.update(() => {
          $insertNodeToNearestRoot($createHorizontalRuleNode());
        }),
    ],
    ["Link", "Link the selected text", link],
    [
      "Unlink",
      "Remove the link",
      () => editor.update(() => $unlinkSelection()),
    ],
  ];
  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
      {buttons.map(([label, title, action]) => (
        <button
          key={title}
          type="button"
          title={title}
          aria-label={title}
          // Keep the selection in the editor.
          onMouseDown={(event) => event.preventDefault()}
          onClick={action}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function BodyEditor({
  initial,
  editorRef,
  invalid,
}: {
  initial: SerializedEditorState | null;
  /** Set to the editor once it exists, so the form can read the body. */
  editorRef: RefObject<LexicalEditor | null>;
  invalid: boolean;
}) {
  return (
    <LexicalComposer
      initialConfig={{
        namespace: "topic-body",
        nodes: BODY_NODES,
        theme: THEME,
        editorState: initial ? JSON.stringify(initial) : undefined,
        onError: (error) => {
          throw error;
        },
      }}
    >
      <div className={invalid ? "editor invalid" : "editor"}>
        <Toolbar />
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className="editor-input"
              id="body"
              aria-label="Body"
              aria-invalid={invalid}
              aria-describedby={invalid ? "body-error" : undefined}
            />
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
      </div>
      <HistoryPlugin />
      <ListPlugin />
      <EditorRefPlugin editorRef={editorRef} />
    </LexicalComposer>
  );
}
