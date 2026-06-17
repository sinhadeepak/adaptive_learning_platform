"""Internal Guidance System (IGS) — Pillar D of the prescriptive brain.

The decision conductor. Composes:

  - PCE personal yield  (what's worth studying for this student)
  - ADP θ + flow state  (at what difficulty)
  - Topic decay         (what needs revisiting now)
  - Time-of-day pattern (when this student performs best)
  - Cohort / peer signal (what worked for similar students — Phase B5)
  - Emotional state     (recent frustration / boredom from ADP events)

…into a single ranked list of actions with explainable rationale.

Files:
  decision.py            — score function + argmax
  candidate_generator.py — produce the action set per call
  explainer.py           — top-3 alternatives + rationale strings
  schemas.py             — Pydantic models
  routes.py              — HTTP endpoints
  stream.py              — FastAPI WebSocket gateway (real-time push)
"""
