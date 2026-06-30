# Rich-text study notes (per-exam notebook)

**Date:** 2026-06-30
**Area:** Study Materials (web-student + services/learning)
**Status:** Approved — ready for implementation plan

## Context

The student Study Materials page (`apps/web-student/src/pages/ExamContent.tsx`,
exam-scoped at `/exams/:examId/content`) aggregates videos / notes / PDFs per
subject→topic. Students want to **author their own notes** there: a rich-text
area where they can write, format, and paste both text and images, with a
comfortable writing typeface.

Exploration findings that shape the design:

- **A per-topic plain-text note feature already exists** but is a different
  surface and not rich: `content_schema.user_topic_notes` (markdown, 4096-char
  cap, no images), `content/notes_routes.py` (GET/PUT/DELETE
  `/content/topic-notes/{user_id}/{topic_id}`), and `lib/notes-api.ts` used as a
  plain textarea in `TopicDetail.tsx`. We are **not** extending that table; this
  is a new, richer, exam-scoped notebook.
- **A complete presigned-upload subsystem already exists** and is the
  established image path: `POST /uploads/presign` (`storage/routes.py`,
  `uploads_router`) returns `{url, object_key, max_bytes, content_type,
  upload_claim}`; the browser PUTs directly to MinIO (`alp-uploads` bucket); an
  HMAC `upload_claim` over `(object_key, user_id, exp)` proves ownership;
  `POST /uploads/finalize` verifies the object and `GET /uploads/sign?key=`
  mints a short-lived read URL for the private bucket. Content resources and
  subjective answers already use this flow.
- **Image moderation is wired** (`content/image_moderation.py` `ImageModerator`
  — `StubImageModerator` locally via `set_moderator` in `main.py`,
  `RekognitionModerator` in prod).
- **No rich-text editor exists** in the stack today — only `react-markdown` for
  rendering. A real WYSIWYG editor (TipTap/ProseMirror) is a new dependency.

## Decisions (locked)

- **Organization:** a **per-exam notebook with multiple named notes**. Notes are
  keyed to `(user_id, exam_id)`; the notebook shows only the current exam's notes.
- **Editor:** **TipTap (ProseMirror) WYSIWYG**, storing the document as
  ProseMirror **JSON**. (Chosen over hand-rolled contentEditable and over a
  markdown editor.)
- **Images:** **uploaded to object storage** via the existing `/uploads/presign`
  flow (new `kind="note_image"`); the note body stores the stable `object_key`,
  never an expiring signed URL.
- **Visibility:** **PRIVATE only** for v1 — no teacher/cohort sharing (YAGNI;
  the per-topic notes' visibility enum is not reused here).
- **Saving:** **debounced autosave** (~1s after typing stops) with a
  "Saving… / Saved ✓" indicator; rename and delete are explicit.
- **Image moderation:** **deferred to a follow-up** (out of scope v1). Note
  images are private and self-only (only the author can ever mint a read URL),
  and the existing upload subsystem does not moderate at finalize today — so v1
  matches that behavior. The wired `ImageModerator` (`get_moderator()`) remains
  available to add later without schema change.

## Limits

- ≤ 100 notes per `(user_id, exam_id)`.
- Title ≤ 200 chars.
- Note `body` JSON ≤ 262144 bytes (256 KB) — enforced server-side on PUT.
- Image size ≤ the existing presign `max_bytes` for image kinds; `image/*` MIME
  only (from the existing `ALLOWED_MIME`).

## Existing building blocks (reused)

- Presign / upload / sign: `storage/routes.py` (`/uploads/presign`,
  `/uploads/finalize`, `/uploads/sign`), `storage/__init__.py` (`object_key`,
  `ALLOWED_MIME`, `sign_upload_claim`, `head_object`).
- Image moderation: `content/image_moderation.py` `get_moderator()` (set in
  `main.py`).
- Auth: `content/security.py` `current_principal` / `JwtPrincipal`.
- DB session pattern: `content/db.py` `sessionmaker` (as used by
  `notes_routes.py`).
- Frontend auth + API base: `lib/api.ts` `auth.fetch`, `lib/env.ts` `env`.
- Study Materials host page: `pages/ExamContent.tsx`; content components under
  `components/content/`.

## Architecture

### Data model — new migration `content_schema.user_notes`

```
CREATE TABLE content_schema.user_notes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL,
  tenant_id   UUID        NOT NULL,
  exam_id     UUID        NOT NULL,
  title       TEXT        NOT NULL DEFAULT 'Untitled note',
  body        JSONB       NOT NULL DEFAULT '{}'::jsonb,  -- ProseMirror doc
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_notes_owner_exam
  ON content_schema.user_notes (user_id, exam_id, updated_at DESC);
```

No FK to `catalog_schema.exams` (cross-schema/service boundary; exam_id is a
soft reference, consistent with how other content rows reference catalog ids).
Image nodes inside `body` store `{ "object_key": "note-images/<uid>/<uuid>.png" }`
in their attrs — never a signed URL.

### Backend — new `content/user_notes_routes.py` (router prefix `/content`, `current_principal`-gated)

Every handler enforces ownership: a row is only readable/writable when
`user_id == principal.user_id` (else 404 — do not reveal existence).

- **`GET /content/notes?exam_id={uuid}`** → `200 [{id, title, updated_at}]`
  ordered by `updated_at DESC`. Lists only the caller's notes for that exam.
- **`POST /content/notes`** body `{exam_id, title?}` → `201 {id, exam_id, title,
  body, created_at, updated_at}`. Creates an empty note (`body = {}`); 409 if the
  caller already has 100 notes for that exam.
- **`GET /content/notes/{note_id}`** → `200 {id, exam_id, title, body,
  created_at, updated_at}`; 404 if missing or not owned.
- **`PUT /content/notes/{note_id}`** body `{title?, body?}` → `200` updated note.
  `title` ≤ 200 chars; serialized `body` ≤ 262144 bytes → else `422`. Updates
  `updated_at`. 404 if missing/not owned.
- **`DELETE /content/notes/{note_id}`** → `204`; 404 if missing/not owned.

### Backend — extend the upload subsystem for note images

- Add `"note_image"` to the `PresignRequest.kind` `Literal` in
  `storage/routes.py` and to the `object_key()` mapping in `storage/__init__.py`
  with layout `note-images/{user_id}/{uuid}.{ext}` (no extra parent ids required;
  scoped to the caller's `user_id`). `image/*` MIME only (already in
  `ALLOWED_MIME`).
- Add a `note-images` branch to the key-prefix maps in **both**
  `POST /uploads/finalize` **and** `GET /uploads/sign` in `storage/routes.py`
  (each currently `400`s on an unknown prefix). Both are **user-scoped**, so
  `owner_segment = parts[1]` (mirroring the `profile-uploads` branch) — the
  existing `owner_segment != principal.user_id → 403` check then enforces the
  caller owns the object. Adding it to `sign` is **required** (otherwise the
  editor cannot mint a read URL to display the image). `finalize` does role/owner
  gating + `head_object` only (no moderation today — see Decisions); on the happy
  path the editor inserts the image after a successful PUT and relies on
  `/uploads/sign` for display, so `finalize` is supported for parity/
  HEAD-verification but not required.

### Frontend — web-student

- **`lib/userNotes-api.ts`** — typed client: `list(examId)`, `create(examId,
  title?)`, `get(id)`, `update(id, {title?, body?})`, `remove(id)`. Mirrors the
  error-handling shape of `lib/notes-api.ts`.
- **`lib/noteImages.ts`** — `uploadNoteImage(file): Promise<{ objectKey }>`
  (presign `note_image` → PUT to `url` → return `object_key`) and
  `signObjectKey(objectKey): Promise<string>` wrapping `GET /uploads/sign`.
- **`components/notes/NoteEditor.tsx`** — TipTap editor: StarterKit (bold,
  italic, headings, bullet/ordered lists, blockquote, code), Link, and a custom
  **Image** extension whose node attr is `objectKey` (not `src`); a paste/drop
  handler intercepts image blobs, calls `uploadNoteImage`, and inserts the node.
  On load, each image node's `objectKey` is resolved to a signed URL for
  rendering (held in component state, never written back to `body`). A compact
  toolbar exposes the formatting actions. Emits debounced (~1s) `onChange(body)`.
- **`components/notes/NoteList.tsx`** — the left rail: list of `{title,
  updated_at}`, active highlight, "＋ New note", per-row rename/delete.
- **`components/notes/NotesPanel.tsx`** — composes list + editor, owns the
  selected-note state, autosave orchestration, and the "Saving…/Saved ✓"
  indicator.
- **`pages/ExamContent.tsx`** — mount a new **"My Notes"** section
  (`NotesPanel examId={examId}`).
- **Deps:** `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-image`,
  `@tiptap/extension-link`.

### Typography

The editor canvas uses the design-system **serif/display** family at ~17px with
generous line-height (a notebook feel distinct from the UI sans). Scoped to the
editor surface; no global typography change.

## Data flow & safety

- **Autosave:** editor `onChange` (debounced ~1s) → `PUT /content/notes/{id}`
  with the current `body` (and `title` on rename). The in-memory buffer is the
  source of truth between saves.
- **Image paste:** intercept blob → `uploadNoteImage` (presign → PUT) → insert
  node with `objectKey` → autosave persists the `objectKey`. Rendering resolves
  `objectKey → signed URL` at load/insert time. Because only `objectKey` is
  persisted, signed-URL expiry never corrupts a saved note.
- **Ownership:** all note endpoints scope by `principal.user_id`; uploads are
  scoped to `user_id` in the object key. Bucket is private (`anonymous none`),
  so images are only reachable via a freshly signed URL.

## Error handling

- Autosave failure → non-blocking "Couldn't save — retrying" toast; buffer
  retained; retried on next change or a manual retry.
- Presign/upload failure → inline broken-image placeholder with a retry
  affordance; the rest of the note is unaffected.
- Oversized / non-image paste → caught client-side pre-upload with a clear
  message (no request sent).
- Backend: 404 for missing/not-owned (no existence leak), 422 for title/body
  caps, 409 for the 100-note cap.

## Testing

- **Backend (pytest, `services/learning/tests/content/`):** create→get→list→
  update→delete happy path; ownership (another user's note → 404 on
  get/put/delete); exam scoping (list returns only that exam's notes);
  title > 200 → 422; body > 256 KB → 422; 100-note cap → 409; the new
  `note_image` presign kind returns a `note-images/{user_id}/…` object key and
  rejects non-image MIME.
- **Frontend (vitest, web-student):** `userNotes-api` request shaping +
  error mapping; `noteImages` presign→PUT→objectKey and `signObjectKey`;
  `NoteEditor` paste→objectKey-node insertion and objectKey→signed-URL
  resolution on load; `NoteList` create/rename/delete interactions; autosave
  debounce fires a single PUT.

## Out of scope (YAGNI)

- Sharing / teacher-visible / cohort / public notes (private only).
- Cross-exam or global notebook; tagging notes to topics.
- Real-time collaboration, version history, offline sync.
- Markdown import/export; printing/PDF export of notes.
- Reusing or migrating the existing `user_topic_notes` table.
- Rich tables, embeds, or video in notes (text formatting + images only).
- Image moderation of note images (deferred; infra exists, private/self-only in
  v1 — see Decisions).
