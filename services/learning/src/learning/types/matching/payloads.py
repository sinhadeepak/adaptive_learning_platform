"""Pydantic payload + response contracts for the 3 Matching family types."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


# ── MATCH_THE_FOLLOWING ──────────────────────────────────────────────────────
# Two parallel lists; author defines correct pairs. list_b may have
# distractors (more right items than left).


class MatchItem(BaseModel):
    id: str = Field(min_length=1, max_length=8)
    text: str = Field(min_length=1, max_length=500)


class MatchPair(BaseModel):
    left_id: str
    right_id: str


class MatchTheFollowingPayload(BaseModel):
    stem: str = Field(min_length=8, max_length=2000)
    list_a: list[MatchItem] = Field(min_length=2, max_length=12)  # left
    list_b: list[MatchItem] = Field(min_length=2, max_length=12)  # right (may include distractors)
    correct_pairs: list[MatchPair] = Field(min_length=1)
    partial_credit: bool = True  # MATCH defaults to partial-credit-on
    explanation: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def _pairs_consistent(self) -> "MatchTheFollowingPayload":
        a_ids = {i.id for i in self.list_a}
        b_ids = {i.id for i in self.list_b}
        if len(a_ids) != len(self.list_a):
            raise ValueError("list_a item ids must be unique")
        if len(b_ids) != len(self.list_b):
            raise ValueError("list_b item ids must be unique")

        # Each pair must reference real ids; left must be unique across pairs.
        seen_lefts: set[str] = set()
        for p in self.correct_pairs:
            if p.left_id not in a_ids:
                raise ValueError(f"left_id {p.left_id!r} not in list_a")
            if p.right_id not in b_ids:
                raise ValueError(f"right_id {p.right_id!r} not in list_b")
            if p.left_id in seen_lefts:
                raise ValueError(f"left_id {p.left_id!r} appears in multiple pairs")
            seen_lefts.add(p.left_id)

        # Every left must have exactly one pairing.
        unmatched_lefts = a_ids - seen_lefts
        if unmatched_lefts:
            raise ValueError(
                f"list_a items not paired: {sorted(unmatched_lefts)}"
            )
        return self


class MatchTheFollowingResponse(BaseModel):
    pairs: list[MatchPair] = Field(default_factory=list)


# ── SEQUENCING ───────────────────────────────────────────────────────────────


class SequencingPayload(BaseModel):
    """Ordered list of items; student drags into correct order."""

    stem: str = Field(min_length=8, max_length=2000)
    items: list[MatchItem] = Field(min_length=2, max_length=12)
    correct_order: list[str] = Field(min_length=2)  # list of item ids
    metric: Literal["all_or_nothing", "longest_correct_prefix", "levenshtein"] = (
        "all_or_nothing"
    )
    explanation: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def _order_consistency(self) -> "SequencingPayload":
        ids = {i.id for i in self.items}
        if len(ids) != len(self.items):
            raise ValueError("item ids must be unique")
        if set(self.correct_order) != ids:
            raise ValueError(
                f"correct_order ids {sorted(set(self.correct_order))} "
                f"must equal items ids {sorted(ids)}"
            )
        if len(self.correct_order) != len(set(self.correct_order)):
            raise ValueError("correct_order must not repeat ids")
        return self


class SequencingResponse(BaseModel):
    order: list[str] = Field(default_factory=list)


# ── CLASSIFICATION ───────────────────────────────────────────────────────────


class CategoryAssignment(BaseModel):
    item_id: str
    category_id: str


class ClassificationPayload(BaseModel):
    """Items + categories; assign each item to a category. Multiple items
    per category allowed; some categories may be empty."""

    stem: str = Field(min_length=8, max_length=2000)
    items: list[MatchItem] = Field(min_length=2, max_length=20)
    categories: list[MatchItem] = Field(min_length=2, max_length=8)
    correct_assignments: list[CategoryAssignment] = Field(min_length=1)
    explanation: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def _assignments_consistent(self) -> "ClassificationPayload":
        item_ids = {i.id for i in self.items}
        cat_ids = {c.id for c in self.categories}
        if len(item_ids) != len(self.items):
            raise ValueError("item ids must be unique")
        if len(cat_ids) != len(self.categories):
            raise ValueError("category ids must be unique")

        # Each item must be assigned to exactly one category.
        seen: set[str] = set()
        for a in self.correct_assignments:
            if a.item_id not in item_ids:
                raise ValueError(f"item_id {a.item_id!r} not in items")
            if a.category_id not in cat_ids:
                raise ValueError(f"category_id {a.category_id!r} not in categories")
            if a.item_id in seen:
                raise ValueError(f"item_id {a.item_id!r} assigned twice")
            seen.add(a.item_id)
        unassigned = item_ids - seen
        if unassigned:
            raise ValueError(f"items not assigned: {sorted(unassigned)}")
        return self


class ClassificationResponse(BaseModel):
    assignments: list[CategoryAssignment] = Field(default_factory=list)
