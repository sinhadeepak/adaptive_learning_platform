"""Admin exam-builder — AI-assisted creation of new exams.

Two-step flow exposed at /admin/exam-builder/*:
  - research: prompt OpenAI for a subject + topic + pool draft for a
    named exam. Returns the proposal as JSON; nothing is persisted.
  - save: take an admin-reviewed proposal and write it transactionally
    to catalog_schema (exams + subjects + topics + subject_pools).

Keeps the AI call out of the write path so admins can review and edit
the structure before committing — important because OpenAI sometimes
gets exam structures subtly wrong (wrong number of GS papers, missing
optional pool, etc.).
"""
