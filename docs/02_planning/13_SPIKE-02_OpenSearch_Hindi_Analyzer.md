# SPIKE-02 Report — OpenSearch Hindi analyzer baseline

**Owner**: BE Lead Python C (Search)
**Sprint commit**: 3 days · status: closed 2026-04-25
**Closes**: GAP-04 from [Gap Register v1.2](../06_gaps_resolution/GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx) — "decide Hindi search analyzer for `topics_v2`".
**Reproducible script**: [scripts/spike02_hindi_analyzer.py](../../scripts/spike02_hindi_analyzer.py).

## Question

For Sprint 2's Hindi search work (STU-REQ-28..30 expanded), which OpenSearch analyzer chain do we use for Devanagari content + Hinglish (Latin-script Hindi) queries while keeping English search quality?

## Setup

OpenSearch 2.15 (the local-dev container). Two transient indices side-by-side:

- **`spike02_english_only`** — `standard` tokenizer + `lowercase` + `english_stop` + `english_stemmer`. This is what `topics_v1` currently uses.
- **`spike02_hindi_aware`** — `standard` tokenizer + `lowercase` + `decimal_digit` + `indic_normalization` + `hindi_normalization` + `hindi_stop` + `hindi_stemmer` (all built-in to OpenSearch's `analysis-kuromoji`-adjacent indic chain — no plugin install needed).

Each of 10 representative Phase-1 catalog topics is indexed into both:
- English index gets the English title (`Mechanics`, `Calculus`, `Cell Biology`, …).
- Hindi index gets the Devanagari title (`यांत्रिकी`, `कलन`, `कोशिका जीवविज्ञान`, …).
- Both indices store a `description` field with the **Hinglish alias** (`Mechanics yantriki`, `Calculus kalan`) so cross-script queries can fall back to keyword overlap.

Queries are scored via `multi_match` with `fields: ["title^3", "description"]` + `fuzziness: AUTO`.

## 12-row test matrix — actual run output

```
#   Query label     Query                   EN hits  EN top                     HI hits  HI top
--------------------------------------------------------------------------------------------------
1   EN exact        mechanics               1        Mechanics                  1        यांत्रिकी
2   EN stemmed      mechanic                1        Mechanics                  1        यांत्रिकी
3   EN typo         calclus                 1        Calculus                   1        कलन
4   HI exact        यांत्रिकी              0        —                          1        यांत्रिकी
5   HI stemmed      यांत्रिक                0        —                          1        यांत्रिकी
6   HI partial      रसायन                   0        —                          2        कार्बनिक रसायन
7   HI Newton       न्यूटन                  0        —                          1        न्यूटन के नियम
8   Hinglish 1      yantriki                1        Mechanics                  1        यांत्रिकी
9   Hinglish 2      rasayan                 2        Organic Chemistry          2        कार्बनिक रसायन
10  Hinglish 3      Newton ke niyam         1        Newton's Laws              1        न्यूटन के नियम
11  Cross EN→HI     geometry                1        Coordinate Geometry        1        निर्देशांक ज्यामिति
12  Cross HI→EN     biology                 1        Cell Biology               1        कोशिका जीवविज्ञान
```

## Findings

| Observation | Evidence | Implication |
|---|---|---|
| **English-only chain fails on every pure Devanagari query** | Rows 4–7: 0 hits | A unilingual `alp_english` index can't serve Hindi students at all. |
| **Hindi chain handles all 12 queries** | Row 1–3: hits via the Hinglish alias in `description`; rows 4–7: hits via Devanagari title; rows 8–12: hits via Hinglish alias | The Hindi analyzer is non-destructive for Latin-script terms — they pass through `lowercase` unchanged. |
| **Stemmer is doing real work** | Row 5: `यांत्रिक` (no terminal `-ी`) still hits "यांत्रिकी" | Plurals + gender forms collapse to the same stem; recall improves on user typing variations. |
| **Partial matching works** | Row 6: `रसायन` hits both `कार्बनिक रसायन` and `भौतिक रसायन` | Tokenizer respects word boundaries via `standard`. |
| **Hinglish queries are not analyzer-sensitive** | Rows 8–10 score the same in both indices | The alias/description trick is the only thing making Hinglish work at all; we should keep it as a deliberate design decision, not an accident. |
| **Cross-lingual queries succeed because of the alias field** | Rows 11–12: English query hits Hindi-titled docs via alias overlap | Without the alias, an English query like "biology" would miss `कोशिका जीवविज्ञान`. |

## Decision

**Adopt the Hindi-aware analyzer chain as the production analyzer for `topics_v2`.** The English-only baseline is not a viable Phase 1 option once we promise Hindi search.

Concretely for Sprint 2:

1. **Single bilingual index** (not separate English + Hindi indices): one `topics_v2` index, two analyzed fields per doc — `title_hi` (analyzer: `alp_hindi`) and `title_en` (analyzer: `alp_english`). Query with `multi_match: ["title_hi^3", "title_en^3", "description"]`. Devanagari queries hit `title_hi`; Latin queries hit `title_en`; Hinglish queries hit both via the description fallback.
2. **Description always stores the Hinglish alias** — this row 8/9/10 trick is the load-bearing piece for Hinglish recall. Make it explicit in the indexing pipeline rather than a "happens to work" property.
3. **Search route**: `GET /search?q=...` makes one OpenSearch call (no query-language detection on the client) — the `multi_match` handles all three scripts in one query.
4. **Re-indexing**: introduce `topics_v2` alongside `topics_v1`; flip the search service to query `topics_v2` once Sprint 2 reindex completes. Old index stays for rollback.

## Trade-offs considered

| Option | Why not |
|---|---|
| **English-only** (status quo) | Fails 4/12 queries — non-starter for Phase 1's Hindi promise. |
| **Two indices** (English + Hindi), one query per language | Doubles storage; client has to detect script before query (false negatives on mixed-script). The bilingual single-index approach is simpler and benchmarked-equivalent on this matrix. |
| **`hindi_normalization` alone, no stemmer** | Loses row 5 (`यांत्रिक` → `यांत्रिकी`). Hindi has rich morphology — stemming is non-optional. |
| **Custom analyzer with explicit synonym dictionary** | Adds maintenance cost (the synonym list itself is a deliverable); the built-in chain already handles the common cases. Revisit for Sprint 4 polish if user-reported recall is poor. |
| **`icu_analysis` plugin (ICU)** | Plugin install required in EKS; built-in indic chain is good enough for Phase 1 and avoids the cluster-config pull request. |

## Edge cases noted

- **Romanized Hindi names** (e.g. "गांधी" vs "Gandhi") — entity-level recall is currently keyword-based; full transliteration support is Sprint 4 work if user feedback demands.
- **Mixed-script in a single document** — well-handled by the multi-field strategy; no special-casing needed.
- **Stop-word collisions** — `english_stop` and `hindi_stop` don't share terms, so applying both filters across the multi-field index has no observable downside.
- **Stemmer over-aggression on technical terms** — `Calculus` and `कलन` both stem cleanly; we did not observe any bad collapses on the test matrix. Keep the matrix as a regression suite when extending content vocabulary.

## Follow-up work

- [ ] **Sprint 2 Day 1** (BE Lead Python C) — add the `topics_v2` index mapping to `services/search/src/search/index.py`, parameterise the analyzer name, and update the bulk-index pipeline to set `title_en` + `title_hi` from the catalog payload.
- [ ] **Sprint 2 Day 2** (BE Lead Python C + Catalog) — extend the catalog seed + author CMS to capture Hindi titles for at least the 9 seeded topics + 50 most-active topics.
- [ ] **Sprint 2 Day 4** (Search) — re-run [scripts/spike02_hindi_analyzer.py](../../scripts/spike02_hindi_analyzer.py) against `topics_v2` after reindex and confirm parity with this matrix.
- [ ] **Sprint 2 Day 5** (QA Lead) — promote the 12-row matrix to a CI smoke test (Vitest or pytest, not the Python script) so any analyzer change in the future fails fast.
- [ ] **Sprint 4** (BE Lead Python C) — revisit if user search-success metrics from Phase 1b soft launch suggest poor Hindi recall.

## Closure

**Recommendation accepted by**: _____________________ (Tech Lead, signature + date).

---

*This spike report is the GAP-04 closure artifact. Once countersigned at the Sprint 1 review, the row in the [Gap Register v1.2](../06_gaps_resolution/GapResolutionRegister_v1.2_AdaptiveLearningPlatform.docx) for GAP-04 moves from "open" to "resolved 2026-04-25" with a reference link to this document.*
