"""Visual & Spatial family handlers — DETERMINISTIC.

DIAGRAM_HOTSPOT · DIAGRAM_LABEL · MAP_LOCATION · PICTORIAL_IDENTIFY.

Image-pixel space for canvas-based handlers; lat/long for MAP_LOCATION.
Tolerance is part of the payload so authors can soften strict edges
(typical: 5-15 px on diagrams; small polygons absorb tolerance via
edge-proximity check).
"""

from __future__ import annotations

from typing import Any

from learning.types.base import PartDetail, Resolution
from learning.types.base_handler import BaseHandler
from learning.types.visual.geom import (
    point_in_geo_polygon,
    point_in_shape,
)
from learning.types.visual.payloads import (
    DiagramHotspotPayload,
    DiagramHotspotResponse,
    DiagramLabelPayload,
    DiagramLabelResponse,
    MapLocationPayload,
    MapLocationResponse,
    PictorialIdentifyPayload,
    PictorialIdentifyResponse,
)


# ── DIAGRAM_HOTSPOT ──────────────────────────────────────────────────────────


class DiagramHotspotHandler(BaseHandler):
    type_id = "DIAGRAM_HOTSPOT"
    family = "Visual & Spatial"
    payload_schema = DiagramHotspotPayload
    response_schema = DiagramHotspotResponse
    evaluation_mode = "DETERMINISTIC"
    supports_partial = False
    media_kinds: list[str] = ["image"]

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return ["stem", "hotspots[*].label", "explanation"]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str,
    ) -> Resolution:
        p = DiagramHotspotPayload.model_validate(payload)
        r = DiagramHotspotResponse.model_validate(response)
        qid = response.get("question_id", "<unknown>")

        if r.click_x is None or r.click_y is None:
            return self._resolution(qid, "UNATTEMPTED", 0, 1)

        hit_id: str | None = None
        for h in p.hotspots:
            shape = h.shape.model_dump()
            if point_in_shape(r.click_x, r.click_y, shape):
                hit_id = h.id
                break

        if hit_id is None:
            # Click missed every hotspot.
            return self._resolution(qid, "INCORRECT", 0, 1)

        is_correct = next(
            (h.is_correct for h in p.hotspots if h.id == hit_id), False
        )
        per_part = [
            PartDetail(
                id=hit_id,
                matched=is_correct,
                details={"click_x": r.click_x, "click_y": r.click_y},
            )
        ]
        return self._resolution(
            qid,
            "CORRECT" if is_correct else "INCORRECT",
            1 if is_correct else 0,
            1,
            per_part=per_part,
        )


# ── DIAGRAM_LABEL ────────────────────────────────────────────────────────────


class DiagramLabelHandler(BaseHandler):
    type_id = "DIAGRAM_LABEL"
    family = "Visual & Spatial"
    payload_schema = DiagramLabelPayload
    response_schema = DiagramLabelResponse
    evaluation_mode = "DETERMINISTIC"
    supports_partial = True
    media_kinds: list[str] = ["image"]

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return ["stem", "labels[*].text", "explanation"]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str,
    ) -> Resolution:
        p = DiagramLabelPayload.model_validate(payload)
        r = DiagramLabelResponse.model_validate(response)
        qid = response.get("question_id", "<unknown>")

        if not r.pairs:
            return self._resolution(qid, "UNATTEMPTED", 0, len(p.correct_pairs))

        correct_map: dict[str, str] = {
            cp.marker_id: cp.label_id for cp in p.correct_pairs
        }
        student_map: dict[str, str] = {sp.marker_id: sp.label_id for sp in r.pairs}

        per_part: list[PartDetail] = []
        matched = 0
        total = len(correct_map)
        for marker_id, expected_label in correct_map.items():
            student_label = student_map.get(marker_id)
            ok = student_label == expected_label
            if ok:
                matched += 1
            per_part.append(
                PartDetail(
                    id=marker_id,
                    matched=ok,
                    details={
                        "expected": expected_label,
                        "got": student_label,
                    },
                )
            )

        if matched == total:
            return self._resolution(qid, "CORRECT", matched, total, per_part)
        if not p.partial_credit:
            return self._resolution(qid, "INCORRECT", 0, total, per_part)
        if matched > 0:
            return self._resolution(qid, "PARTIAL_CORRECT", matched, total, per_part)
        return self._resolution(qid, "INCORRECT", 0, total, per_part)


# ── MAP_LOCATION ─────────────────────────────────────────────────────────────


class MapLocationHandler(BaseHandler):
    type_id = "MAP_LOCATION"
    family = "Visual & Spatial"
    payload_schema = MapLocationPayload
    response_schema = MapLocationResponse
    evaluation_mode = "DETERMINISTIC"
    supports_partial = False
    media_kinds: list[str] = ["image"]

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return ["stem", "explanation"]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str,
    ) -> Resolution:
        p = MapLocationPayload.model_validate(payload)
        r = MapLocationResponse.model_validate(response)
        qid = response.get("question_id", "<unknown>")

        if r.click_lat is None or r.click_lng is None:
            return self._resolution(qid, "UNATTEMPTED", 0, 1)

        polygon_pts = [pt.model_dump() for pt in p.correct_region.points]
        ok = point_in_geo_polygon(r.click_lat, r.click_lng, polygon_pts)
        per_part = [
            PartDetail(
                id="click",
                matched=ok,
                details={"click_lat": r.click_lat, "click_lng": r.click_lng},
            )
        ]
        return self._resolution(
            qid,
            "CORRECT" if ok else "INCORRECT",
            1 if ok else 0,
            1,
            per_part=per_part,
        )


# ── PICTORIAL_IDENTIFY ───────────────────────────────────────────────────────


class PictorialIdentifyHandler(BaseHandler):
    type_id = "PICTORIAL_IDENTIFY"
    family = "Visual & Spatial"
    payload_schema = PictorialIdentifyPayload
    response_schema = PictorialIdentifyResponse
    evaluation_mode = "DETERMINISTIC"
    supports_partial = False
    media_kinds: list[str] = ["image"]

    def translatable_fields(self, payload: dict[str, Any]) -> list[str]:
        return ["stem", "options[*].text", "explanation"]

    async def evaluate(
        self, payload: dict[str, Any], response: dict[str, Any], lang: str,
    ) -> Resolution:
        p = PictorialIdentifyPayload.model_validate(payload)
        r = PictorialIdentifyResponse.model_validate(response)
        qid = response.get("question_id", "<unknown>")

        if r.selected_id is None:
            return self._resolution(qid, "UNATTEMPTED", 0, 1)
        ok = r.selected_id == p.correct_id
        per_part = [
            PartDetail(
                id=r.selected_id,
                matched=ok,
                details={"selected_id": r.selected_id, "correct_id": p.correct_id},
            )
        ]
        return self._resolution(
            qid,
            "CORRECT" if ok else "INCORRECT",
            1 if ok else 0,
            1,
            per_part=per_part,
        )
