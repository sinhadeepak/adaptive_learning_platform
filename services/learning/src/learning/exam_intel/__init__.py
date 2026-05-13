"""Exam Intelligence System (EIS) — Pillar A of the prescriptive brain.

Ingests every past paper for every exam, mines topic/concept
appearance patterns, and forecasts what's likely to appear next.

Architecture (see plan §B1):

    ingest.py     — accept PDF / JSON / structured upload → past_papers row
    tagger.py     — LLM-tag every question via AI Gateway
    aggregator.py — roll up to topic_appearance_stats / concept_appearance_stats
    forecaster.py — fit topic_forecast per exam
    routes.py     — HTTP endpoints (admin ingest + student-facing yield)
    schemas.py    — Pydantic models shared across the above
"""
