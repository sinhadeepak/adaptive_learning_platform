"""Screening — Phase 6 S49.

Anonymous-friendly diagnostic flow for first-time visitors. Pick exam,
answer 12 questions, see readiness + topic breakdown, then sign up
to unlock a plan.

Anonymous tokens cached in Redis with 30-min TTL; persisted as a
real quiz session only after signup completes.
"""
