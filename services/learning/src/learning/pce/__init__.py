"""Probabilistic Curriculum Engine (PCE) — Pillar B of the prescriptive brain.

Combines EIS topic-yield × per-student mastery gap × decay severity ×
time-to-exam pressure to produce a *personalised* ranked list of
"what to study now for maximum expected score gain."

The flagship formula (plan §B2):

    personal_yield(topic, user) =
          base_yield(topic)                       (from EIS)
        × (1 - current_mastery(user, topic))      (room to grow)
        × decay_severity(user, topic)             (forgetting risk)
        × time_pressure(days_to_exam)             (urgency multiplier)

Files:
  personal_yield.py  — compute + persist + read
  routes.py          — HTTP endpoints
  schemas.py         — Pydantic models
"""
