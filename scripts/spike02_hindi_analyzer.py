#!/usr/bin/env python3
"""SPIKE-02 — OpenSearch Hindi analyzer baseline.

Reproducible script for the spike report at docs/02_planning/13_SPIKE-02_OpenSearch_Hindi_Analyzer.md.

What it does:
1. Creates two transient indices side-by-side:
   - `spike02_english_only` — `standard` + `english_stop` + `english_stemmer`
   - `spike02_hindi_aware`  — `standard` + `lowercase` + `decimal_digit` +
     OpenSearch's built-in `hindi_stop` + `hindi_normalization` + `hindi_stemmer` filter chain.
2. Indexes 10 documents with bilingual title + description fields (one analyzer wins per index).
3. Runs a 12-query test matrix covering pure Hindi, Hinglish, and English queries.
4. Prints a side-by-side comparison table (best score + hit count per index).
5. Drops both transient indices on exit.

No real `topics_v1` index is touched. Re-runnable.
"""

from __future__ import annotations

import sys
from typing import Any

import httpx

OPENSEARCH = "http://localhost:39200"
EN_INDEX = "spike02_english_only"
HI_INDEX = "spike02_hindi_aware"

# 10 documents with English + Devanagari + Hinglish title variants.
DOCS: list[dict[str, str]] = [
    {"id": "1", "title_en": "Mechanics", "title_hi": "यांत्रिकी", "alias": "Mechanics yantriki"},
    {"id": "2", "title_en": "Thermodynamics", "title_hi": "ऊष्मागतिकी", "alias": "Thermodynamics ushmagatiki"},
    {"id": "3", "title_en": "Electrostatics", "title_hi": "स्थिरवैद्युतिकी", "alias": "Electrostatics sthir vidyutiki"},
    {"id": "4", "title_en": "Calculus", "title_hi": "कलन", "alias": "Calculus kalan"},
    {"id": "5", "title_en": "Coordinate Geometry", "title_hi": "निर्देशांक ज्यामिति", "alias": "Coordinate Geometry jyamiti"},
    {"id": "6", "title_en": "Cell Biology", "title_hi": "कोशिका जीवविज्ञान", "alias": "Cell Biology jeev vigyan"},
    {"id": "7", "title_en": "Genetics", "title_hi": "आनुवंशिकी", "alias": "Genetics anuvanshiki"},
    {"id": "8", "title_en": "Organic Chemistry", "title_hi": "कार्बनिक रसायन", "alias": "Organic Chemistry karbanik rasayan"},
    {"id": "9", "title_en": "Physical Chemistry", "title_hi": "भौतिक रसायन", "alias": "Physical Chemistry bhautik rasayan"},
    {"id": "10", "title_en": "Newton's Laws", "title_hi": "न्यूटन के नियम", "alias": "Newton ke niyam"},
]

# (label, query, language hint) — the test matrix.
QUERIES: list[tuple[str, str, str]] = [
    ("EN exact",     "mechanics", "en"),
    ("EN stemmed",   "mechanic",  "en"),         # English stemmer should hit
    ("EN typo",      "calclus",   "en"),         # fuzziness AUTO; Hindi index won't tolerate
    ("HI exact",     "यांत्रिकी",   "hi"),
    ("HI stemmed",   "यांत्रिक",    "hi"),         # Hindi stemmer normalizes endings
    ("HI partial",   "रसायन",      "hi"),         # matches both Organic + Physical Chemistry
    ("HI Newton",    "न्यूटन",      "hi"),
    ("Hinglish 1",   "yantriki",  "hinglish"),   # English-script Hindi term
    ("Hinglish 2",   "rasayan",   "hinglish"),
    ("Hinglish 3",   "Newton ke niyam", "hinglish"),
    ("Cross EN→HI",  "geometry",  "en"),
    ("Cross HI→EN",  "biology",   "en"),
]


def http(method: str, path: str, body: dict[str, Any] | None = None) -> httpx.Response:
    url = f"{OPENSEARCH}{path}"
    if method == "DELETE":
        return httpx.delete(url, timeout=10.0)
    if method == "PUT":
        return httpx.put(url, json=body, timeout=10.0)
    if method == "POST":
        return httpx.post(url, json=body, timeout=10.0)
    raise ValueError(method)


ENGLISH_SETTINGS = {
    "settings": {
        "number_of_shards": 1,
        "number_of_replicas": 0,
        "analysis": {
            "analyzer": {
                "alp_english": {
                    "tokenizer": "standard",
                    "filter": ["lowercase", "english_stop", "english_stemmer"],
                }
            },
            "filter": {
                "english_stop": {"type": "stop", "stopwords": "_english_"},
                "english_stemmer": {"type": "stemmer", "language": "english"},
            },
        },
    },
    "mappings": {
        "properties": {
            "id": {"type": "keyword"},
            "title": {"type": "text", "analyzer": "alp_english"},
            "description": {"type": "text", "analyzer": "alp_english"},
        }
    },
}

HINDI_SETTINGS = {
    "settings": {
        "number_of_shards": 1,
        "number_of_replicas": 0,
        "analysis": {
            "analyzer": {
                "alp_hindi": {
                    "tokenizer": "standard",
                    "filter": [
                        "lowercase",
                        "decimal_digit",
                        "indic_normalization",
                        "hindi_normalization",
                        "hindi_stop",
                        "hindi_stemmer",
                    ],
                }
            },
            "filter": {
                "hindi_stop": {"type": "stop", "stopwords": "_hindi_"},
                "hindi_stemmer": {"type": "stemmer", "language": "hindi"},
            },
        },
    },
    "mappings": {
        "properties": {
            "id": {"type": "keyword"},
            "title": {"type": "text", "analyzer": "alp_hindi"},
            "description": {"type": "text", "analyzer": "alp_hindi"},
        }
    },
}


def setup() -> None:
    for idx in (EN_INDEX, HI_INDEX):
        http("DELETE", f"/{idx}")
    en = http("PUT", f"/{EN_INDEX}", ENGLISH_SETTINGS)
    en.raise_for_status()
    hi = http("PUT", f"/{HI_INDEX}", HINDI_SETTINGS)
    hi.raise_for_status()

    # Index every doc into both indices. The English index gets the EN title;
    # the Hindi index gets the HI title; both get the Hinglish alias as description so
    # cross-script queries can hit it.
    for d in DOCS:
        http("POST", f"/{EN_INDEX}/_doc/{d['id']}?refresh=true", {
            "id": d["id"],
            "title": d["title_en"],
            "description": d["alias"],
        }).raise_for_status()
        http("POST", f"/{HI_INDEX}/_doc/{d['id']}?refresh=true", {
            "id": d["id"],
            "title": d["title_hi"],
            "description": d["alias"],
        }).raise_for_status()


def search_one(index: str, query: str) -> tuple[int, float, str]:
    body = {
        "query": {
            "multi_match": {
                "query": query,
                "fields": ["title^3", "description"],
                "fuzziness": "AUTO",
            }
        },
        "size": 3,
    }
    r = http("POST", f"/{index}/_search", body)
    r.raise_for_status()
    payload = r.json()
    hits = payload["hits"]["hits"]
    total = payload["hits"]["total"]["value"]
    if not hits:
        return total, 0.0, "—"
    top = hits[0]
    return total, top["_score"], f"id={top['_source']['id']} {top['_source']['title']}"


def teardown() -> None:
    for idx in (EN_INDEX, HI_INDEX):
        http("DELETE", f"/{idx}")


def main() -> int:
    print(f"Setting up {EN_INDEX} + {HI_INDEX} ...", flush=True)
    setup()
    print()
    print(
        f"{'#':<3} {'Query label':<14} {'Query':<20} "
        f"{'EN hits':<7} {'EN top':<26} {'HI hits':<7} {'HI top':<26}"
    )
    print("-" * 110)
    for i, (label, q, lang_hint) in enumerate(QUERIES, 1):
        en_total, en_score, en_top = search_one(EN_INDEX, q)
        hi_total, hi_score, hi_top = search_one(HI_INDEX, q)
        print(
            f"{i:<3} {label:<14} {q:<20} "
            f"{en_total:<7} {en_top[:25]:<26} {hi_total:<7} {hi_top[:25]:<26}"
        )
    print()
    print("Tearing down ...")
    teardown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
