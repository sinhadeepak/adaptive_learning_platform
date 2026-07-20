// Rich-text note editor (TipTap). Persists ProseMirror JSON with image objectKeys;
// resolves objectKeys → signed URLs on load. Writing surface uses the serif display font.
import "./NoteEditor.css";
import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { NoteImage } from "./NoteImage";
import {
  EMPTY_DOC,
  collectObjectKeys,
  stripTransientSrc,
  type ProseMirrorDoc,
} from "../../lib/noteDoc";
import { signObjectKey, uploadNoteImage } from "../../lib/noteImages";

interface Props {
  value: ProseMirrorDoc | null;
  onChange: (doc: ProseMirrorDoc) => void;
}

// Returns value only when it is a valid ProseMirror doc (has a `type` string).
// Falls back to EMPTY_DOC for null, undefined, `{}`, or any other invalid shape
// that would cause ProseMirror to throw RangeError: Invalid input for Node.fromJSON.
const docOf = (v: ProseMirrorDoc | null): ProseMirrorDoc =>
  v && typeof v.type === "string" ? v : EMPTY_DOC;

export function NoteEditor({ value, onChange }: Props) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      NoteImage,
    ],
    content: docOf(value),
    onUpdate: ({ editor }) => {
      onChangeRef.current(stripTransientSrc(editor.getJSON() as ProseMirrorDoc));
    },
    editorProps: {
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []);
        const image = files.find((f) => f.type.startsWith("image/"));
        if (!image) return false;
        event.preventDefault();
        void (async () => {
          try {
            const objectKey = await uploadNoteImage(image);
            const src = await signObjectKey(objectKey);
            editor?.chain().focus().setImage({ src, objectKey } as never).run();
          } catch {
            /* surfaced by the panel-level toast; leave the note intact */
          }
        })();
        return true;
      },
    },
  });

  // Resolve image objectKeys → signed URLs whenever the loaded note changes.
  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(docOf(value), false);
    const keys = collectObjectKeys(docOf(value));
    if (keys.length === 0) return;
    let cancelled = false;
    void (async () => {
      const map = new Map<string, string>();
      await Promise.all(
        keys.map(async (k) => {
          try {
            map.set(k, await signObjectKey(k));
          } catch {
            /* leave unresolved */
          }
        }),
      );
      if (cancelled) return;
      const { state, view } = editor;
      const tr = state.tr;
      state.doc.descendants((node, pos) => {
        if (node.type.name === "image") {
          const key = node.attrs.objectKey as string | null;
          const url = key ? map.get(key) : undefined;
          if (url) tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: url });
        }
      });
      if (tr.docChanged) {
        tr.setMeta("preventUpdate", true);
        view.dispatch(tr);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, value]);

  if (!editor) return null;

  return (
    <div className="note-editor">
      <div className="note-editor__toolbar">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()}><b>B</b></button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()}><i>I</i></button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</button>
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}>• List</button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()}>1. List</button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()}>❝</button>
      </div>
      <EditorContent editor={editor} className="note-editor__canvas" />
    </div>
  );
}
