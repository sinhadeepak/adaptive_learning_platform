# Object storage layout — `alp-uploads` bucket

Every user-uploaded artefact across the platform lands in a single S3
bucket (`alp-uploads`) following the prefix conventions below. MinIO
serves this bucket in dev (`docker-compose.yml`); staging / prod swap
in real S3 with the same prefix layout.

## Why one bucket, many prefixes

- One IAM policy, one CORS config, one lifecycle policy — no copy/paste
  drift across per-feature buckets.
- Easy to backup, redact-by-user, or apply tenant-scoped policies via
  prefix patterns (`quiz-responses/{tenant_id}/...`).
- Cross-team observability: a single Grafana dashboard for
  bucket size / object count / 4xx rates.

## Prefix tree

```
alp-uploads/
├── quiz-responses/                    # Student answers (case-study uploads, photo answers)
│   └── {tenant_id}/                   # `default` when no tenancy in dev
│       └── {user_id}/
│           └── sessions/{session_id}/
│               └── q/{question_id}/
│                   └── parts/{sub_question_id}/      # ESSAY: parts/main
│                       └── {file_id}.{ext}           # uuidv7 → naturally time-sortable
│
├── doubts/                            # Doubt-photo uploads (mobile/web)
│   └── {tenant_id}/{user_id}/
│       └── {doubt_id}/{file_id}.{ext}
│
├── content-media/                     # Author-uploaded media for question stems
│   └── {question_id}/{file_id}.{ext}  # served via /content/media/{id}/file
│
├── profile-uploads/                   # Avatars, ID proofs, signature scans
│   └── {user_id}/avatar/{file_id}.{ext}
│   └── {user_id}/id-proof/{file_id}.{ext}
│
└── tmp/                               # Direct-upload scratch space (presigned PUTs land here
    └── {tenant_id}/{user_id}/         # before the finalize endpoint moves them to a typed prefix)
        └── {file_id}.{ext}
```

## Naming rules

- `{file_id}` is uuidv7 (or uuidv4 if v7 isn't available in the language) —
  monotonic enough that listing by prefix returns oldest-first.
- `{ext}` is the file extension lowercased, drawn from the `Content-Type`
  on the presign request, NOT the user's filename. Whitelist: `jpg`,
  `jpeg`, `png`, `webp`, `heic`, `pdf`, `mp3`, `mp4`, `webm`. Anything
  outside the list is rejected at presign time.
- The original filename is kept as object metadata
  (`x-amz-meta-original-name`) so audit / download UIs can show it back.

## Lifecycle (configure once at bootstrap)

| Prefix              | Rule                                                         |
|---------------------|--------------------------------------------------------------|
| `tmp/`              | Delete after 24h — these are presigned-PUT staging objects.  |
| `quiz-responses/`   | Move to `INFREQUENT_ACCESS` after 90d, archive after 1y.     |
| `content-media/`    | Standard storage; no expiry (canonical content).             |
| `doubts/`           | Delete after 1y (matches doubt-retention policy).            |
| `profile-uploads/`  | Standard; deleted on user delete (handled by app, not lifecycle). |

## Access pattern

Backend never serves files. Two flows:

1. **Upload (PUT)** — the browser asks `POST /api/v1/uploads/presign`
   with `{ kind, contentType, originalName, parentIds... }`. Server
   returns `{ url, fields, objectKey, expiresAt }`. Browser PUTs the
   bytes directly to MinIO. Browser then calls `POST /api/v1/uploads/finalize`
   with `{ objectKey }` so the server can record the metadata against
   the parent (e.g. attach to a quiz answer, doubt thread, etc.).

2. **Download (GET)** — server signs a short-lived GET URL on demand
   (`GET /api/v1/uploads/sign?key=...`) returning `{ url, expiresAt }`.
   The browser fetches directly from MinIO. Default TTL: 5 minutes.

This split keeps file bytes off the app servers and gives us per-object
auth checks at finalize/sign time.

## Key examples

```
# Class 9 Hindi case-study, part-b answer (image of handwriting)
quiz-responses/default/3a4b…/sessions/8e2028eb…/q/c542d47e…/parts/b/0193abc…d.jpg

# Doubt photo
doubts/default/3a4b…/doubt-2026-05-04-001/0193abc…e.jpg

# Author-uploaded diagram for a Physics question
content-media/c542d47e…/0193abc…f.png
```
