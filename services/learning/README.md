# alp-learning

Consolidated service that absorbs `services/catalog/`, `services/content/`, `services/doubts/`, `services/search/`, and `services/adaptive-engine/`.

Per [ADR-0005](../../docs/adr/0005-service-consolidation.md), this is the destination for everything about learning *material* and how to surface or personalise it.

## State

**Sprint A**: skeleton — boots `/health` only.
**Sprint C**: modules move in (in dependency order: catalog → content → doubts → search → adaptive-engine); routers mount at the same URL prefixes used today; chatty HTTP edges (`content→catalog`, `adaptive→catalog`, `adaptive→content`, `search→catalog`) collapse to in-process calls.

## Storage

- Postgres DB `learning` with three schemas: `catalog_schema`, `content_schema`, `doubts_schema` (search has no Postgres footprint).
- OpenSearch — `topics_v2` alias-rotation supported (carries over from search).
- Redis — adaptive's rate-limit / photo-doubt cache.

Each Postgres schema keeps its own `alembic_version` table via `version_table_schema=<schema>`.
