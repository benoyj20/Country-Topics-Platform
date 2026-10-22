"use client";

import {
  $isListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
  ListNode,
  REMOVE_LIST_COMMAND,
} from "@lexical/list";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import {
  $createHeadingNode,
  $createQuoteNode,
  $isHeadingNode,
  $isQuoteNode,
  type HeadingTagType,
} from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import {
  $getNearestNodeOfType,
  $insertNodeToNearestRoot,
  mergeRegister,
} from "@lexical/utils";
import {
  $createParagraphNode,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  type BaseSelection,
  CAN_REDO_COMMAND,
  CAN_UNDO_COMMAND,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  INDENT_CONTENT_COMMAND,
  KEY_MODIFIER_COMMAND,
  KEY_TAB_COMMAND,
  type LexicalEditor,
  OUTDENT_CONTENT_COMMAND,
  REDO_COMMAND,
  type SerializedEditorState,
  type TextFormatType,
  UNDO_COMMAND,
} from "lexical";
import { type RefObject, useCallback, useEffect, useState } from "react";

import {
  $createHorizontalRuleNode,
  $linkSelection,
  $selectedLink,
  $unlinkSelection,
  BODY_NODES,
  type LinkFields,
} from "./body-nodes";
import { LinkDialog } from "./LinkDialog";

// A topic's body editor, loaded in the browser only (next/dynamic with
// ssr: false), so neither the Worker nor the public pages carry it (ADR
// 0014, "Heavy parts load in the browser"). Its toolbar has the formats and
// blocks apps/web's editor allows (src/editor.ts): no uploads, embeds, or
// indented paragraphs; lists nest with Tab, as in Payload's editor.

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
    bold: "editor-bold",
    italic: "editor-italic",
    underline: "editor-underline",
    strikethrough: "editor-strikethrough",
    underlineStrikethrough: "editor-underline-strikethrough",
  },
};

type Block = "p" | "quote" | HeadingTagType | "bullet" | "number";

const BLOCK_LABELS: Partial<Record<Block, string>> = {
  p: "Paragraph",
  h2: "Heading 2",
  h3: "Heading 3",
  h4: "Heading 4",
  quote: "Quote",
};

const FORMATS: [TextFormatType, string, string][] = [
  ["bold", "B", "Bold"],
  ["italic", "I", "Italic"],
  ["underline", "U", "Underline"],
  ["strikethrough", "S", "Strikethrough"],
];

type Shown = {
  formats: ReadonlySet<TextFormatType>;
  block: Block;
  inLink: boolean;
};

/** What the selection is: its formats, its block, and whether it is in a link. */
function $shown(): Shown | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return null;
  const anchor = selection.anchor.getNode();
  const list = $getNearestNodeOfType(anchor, ListNode);
  const top = anchor.getKey() === "root" ? null : anchor.getTopLevelElement();
  const block: Block = $isListNode(list)
    ? list.getListType() === "number"
      ? "number"
      : "bullet"
    : $isHeadingNode(top)
      ? top.getTag()
      : $isQuoteNode(top)
        ? "quote"
        : "p";
  return {
    formats: new Set(
      FORMATS.flatMap(([format]) =>
        selection.hasFormat(format) ? [format] : [],
      ),
    ),
    block,
    inLink: $selectedLink() !== null,
  };
}

function setBlock(editor: LexicalEditor, block: Block) {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) return;
    $setBlocksType(selection, () =>
      block === "quote"
        ? $createQuoteNode()
        : block === "h2" || block === "h3" || block === "h4"
          ? $createHeadingNode(block)
          : $createParagraphNode(),
    );
  });
}

/** The link being added or changed, with the selection it applies to. */
type Linking = { selection: BaseSelection | null; fields: LinkFields | null };

function Toolbar({ onLink }: { onLink: (linking: Linking) => void }) {
  const [editor] = useLexicalComposerContext();
  const [shown, setShown] = useState<Shown>({
    formats: new Set(),
    block: "p",
    inLink: false,
  });
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [hint, setHint] = useState("");

  const startLink = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      const link = $selectedLink();
      if (!link && (!$isRangeSelection(selection) || selection.isCollapsed())) {
        setHint("Select the words to link first.");
        return;
      }
      setHint("");
      onLink({
        selection: selection?.clone() ?? null,
        fields: link ? { ...link.getFields() } : null,
      });
    });
  }, [editor, onLink]);

  useEffect(
    () =>
      mergeRegister(
        editor.registerUpdateListener(({ editorState }) => {
          const next = editorState.read($shown);
          if (next) setShown(next);
        }),
        editor.registerCommand(
          CAN_UNDO_COMMAND,
          (can) => {
            setCanUndo(can);
            return false;
          },
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(
          CAN_REDO_COMMAND,
          (can) => {
            setCanRedo(can);
            return false;
          },
          COMMAND_PRIORITY_LOW,
        ),
        // Tab nests and un-nests list items; elsewhere it leaves the editor.
        editor.registerCommand(
          KEY_TAB_COMMAND,
          (event) => {
            const block = editor.getEditorState().read(() => $shown()?.block);
            if (block !== "bullet" && block !== "number") return false;
            event.preventDefault();
            return editor.dispatchCommand(
              event.shiftKey ? OUTDENT_CONTENT_COMMAND : INDENT_CONTENT_COMMAND,
              undefined,
            );
          },
          COMMAND_PRIORITY_LOW,
        ),
        editor.registerCommand(
          KEY_MODIFIER_COMMAND,
          (event) => {
            if (event.key.toLowerCase() !== "k") return false;
            event.preventDefault();
            startLink();
            return true;
          },
          COMMAND_PRIORITY_LOW,
        ),
      ),
    [editor, startLink],
  );

  const toggleList = (type: "bullet" | "number") =>
    editor.dispatchCommand(
      shown.block === type
        ? REMOVE_LIST_COMMAND
        : type === "bullet"
          ? INSERT_UNORDERED_LIST_COMMAND
          : INSERT_ORDERED_LIST_COMMAND,
      undefined,
    );
  // Buttons keep the selection in the editor.
  const keepSelection = {
    onMouseDown: (event: { preventDefault(): void }) => event.preventDefault(),
  };

  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
      <select
        aria-label="Text style"
        value={BLOCK_LABELS[shown.block] ? shown.block : ""}
        onChange={(event) => setBlock(editor, event.target.value as Block)}
      >
        {BLOCK_LABELS[shown.block] ? null : (
          <option value="" disabled>
            List
          </option>
        )}
        {Object.entries(BLOCK_LABELS).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {FORMATS.map(([format, label, title]) => (
        <button
          key={format}
          type="button"
          title={title}
          aria-label={title}
          aria-pressed={shown.formats.has(format)}
          className={`editor-format-${format}`}
          {...keepSelection}
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, format)}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        title="Bulleted list"
        aria-label="Bulleted list"
        aria-pressed={shown.block === "bullet"}
        {...keepSelection}
        onClick={() => toggleList("bullet")}
      >
        •
      </button>
      <button
        type="button"
        title="Numbered list"
        aria-label="Numbered list"
        aria-pressed={shown.block === "number"}
        {...keepSelection}
        onClick={() => toggleList("number")}
      >
        1.
      </button>
      <button
        type="button"
        title="Horizontal rule"
        aria-label="Horizontal rule"
        {...keepSelection}
        onClick={() =>
          editor.update(() => {
            $insertNodeToNearestRoot($createHorizontalRuleNode());
          })
        }
      >
        —
      </button>
      <button
        type="button"
        title="Link (Ctrl+K)"
        aria-label={shown.inLink ? "Edit link" : "Link"}
        aria-pressed={shown.inLink}
        {...keepSelection}
        onClick={startLink}
      >
        Link
      </button>
      <button
        type="button"
        title="Undo (Ctrl+Z)"
        aria-label="Undo"
        disabled={!canUndo}
        {...keepSelection}
        onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
      >
        ↶
      </button>
      <button
        type="button"
        title="Redo (Ctrl+Y)"
        aria-label="Redo"
        disabled={!canRedo}
        {...keepSelection}
        onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
      >
        ↷
      </button>
      <span className="editor-hint" role="status">
        {hint}
      </span>
    </div>
  );
}

function Linker({ linking, onDone }: { linking: Linking; onDone: () => void }) {
  const [editor] = useLexicalComposerContext();
  const apply = (change: () => void) => {
    editor.update(() => {
      if (linking.selection) $setSelection(linking.selection.clone());
      change();
    });
    onDone();
  };
  return (
    <LinkDialog
      initial={linking.fields}
      onSave={(fields) => apply(() => $linkSelection(fields))}
      onRemove={() =>
        apply(() => {
          // With only the cursor in a link, the whole link goes.
          const link = $selectedLink();
          link?.select(0, link.getChildrenSize());
          $unlinkSelection();
        })
      }
      onClose={onDone}
      // Once the dialog has closed: until then the page behind it is inert.
      onClosed={() => editor.focus()}
    />
  );
}

export default function BodyEditor({
  initial,
  editorRef,
  onChange,
  readOnly,
  invalid,
  describedBy,
}: {
  initial: SerializedEditorState | null;
  /** Set to the editor once it exists, so the form can read the body. */
  editorRef: RefObject<LexicalEditor | null>;
  /** Called when the body's content changes, not its selection. */
  onChange: () => void;
  readOnly: boolean;
  invalid: boolean;
  describedBy?: string;
}) {
  const [linking, setLinking] = useState<Linking | null>(null);
  return (
    <LexicalComposer
      initialConfig={{
        namespace: "topic-body",
        nodes: BODY_NODES,
        theme: THEME,
        editable: !readOnly,
        editorState: initial ? JSON.stringify(initial) : undefined,
        onError: (error) => {
          throw error;
        },
      }}
    >
      <div className={invalid ? "editor invalid" : "editor"}>
        {!readOnly && <Toolbar onLink={setLinking} />}
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className="editor-input"
              id="body"
              aria-label="Body"
              aria-multiline
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
              aria-readonly={readOnly || undefined}
            />
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
      </div>
      <HistoryPlugin />
      <ListPlugin />
      <EditorRefPlugin editorRef={editorRef} />
      <OnChangePlugin ignoreSelectionChange onChange={() => onChange()} />
      {linking && <Linker linking={linking} onDone={() => setLinking(null)} />}
    </LexicalComposer>
  );
}
