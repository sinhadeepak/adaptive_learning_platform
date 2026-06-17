"""Phase 5 (P5-S44) — Visual & Spatial family + geometry helpers.

Pure-function tests for point_in_circle/rect/polygon + geo polygon +
the 4 visual handlers' evaluate() paths.
"""

from __future__ import annotations

import asyncio

import pytest

from learning.types.base import PROTOCOL_ATTRS, PROTOCOL_METHODS
from learning.types.visual.geom import (
    point_in_circle,
    point_in_geo_polygon,
    point_in_polygon,
    point_in_rect,
    point_in_shape,
)
from learning.types.visual.handlers import (
    DiagramHotspotHandler,
    DiagramLabelHandler,
    MapLocationHandler,
    PictorialIdentifyHandler,
)


def _run(coro):
    return asyncio.run(coro)


# ── point_in_circle ──────────────────────────────────────────────────────────


def test_circle_centre_inside() -> None:
    assert point_in_circle(50, 50, cx=50, cy=50, r=10) is True


def test_circle_far_outside() -> None:
    assert point_in_circle(0, 0, cx=50, cy=50, r=10) is False


def test_circle_on_boundary() -> None:
    # Distance == r → inside.
    assert point_in_circle(60, 50, cx=50, cy=50, r=10) is True


def test_circle_tolerance_extends_radius() -> None:
    assert point_in_circle(65, 50, cx=50, cy=50, r=10) is False
    assert point_in_circle(65, 50, cx=50, cy=50, r=10, tolerance=5) is True


# ── point_in_rect ─────────────────────────────────────────────────────────────


def test_rect_inside() -> None:
    assert point_in_rect(15, 15, x=10, y=10, width=20, height=20) is True


def test_rect_outside() -> None:
    assert point_in_rect(5, 5, x=10, y=10, width=20, height=20) is False


def test_rect_tolerance() -> None:
    assert point_in_rect(8, 8, x=10, y=10, width=20, height=20) is False
    assert point_in_rect(8, 8, x=10, y=10, width=20, height=20, tolerance=3) is True


# ── point_in_polygon ─────────────────────────────────────────────────────────


def _square_polygon(size: int = 100) -> list[tuple[int, int]]:
    return [(0, 0), (size, 0), (size, size), (0, size)]


def test_polygon_centre_inside() -> None:
    assert point_in_polygon(50, 50, points=_square_polygon()) is True


def test_polygon_outside() -> None:
    assert point_in_polygon(150, 150, points=_square_polygon()) is False


def test_polygon_concave() -> None:
    # L-shape: (0,0)-(100,0)-(100,50)-(50,50)-(50,100)-(0,100)
    pts = [(0, 0), (100, 0), (100, 50), (50, 50), (50, 100), (0, 100)]
    assert point_in_polygon(25, 75, points=pts) is True   # inside L
    assert point_in_polygon(75, 75, points=pts) is False  # in cut-out


def test_polygon_tolerance_grabs_near_edge() -> None:
    pts = _square_polygon(size=100)
    # 3 px outside the right edge.
    assert point_in_polygon(103, 50, points=pts) is False
    assert point_in_polygon(103, 50, points=pts, tolerance=5) is True


# ── point_in_shape dispatcher ────────────────────────────────────────────────


def test_dispatch_circle() -> None:
    shape = {"kind": "circle", "cx": 50, "cy": 50, "r": 10, "tolerance_px": 0}
    assert point_in_shape(50, 50, shape) is True
    assert point_in_shape(70, 70, shape) is False


def test_dispatch_unknown_shape() -> None:
    assert point_in_shape(0, 0, {"kind": "weird"}) is False


# ── geo polygon ──────────────────────────────────────────────────────────────


def test_geo_polygon_inside() -> None:
    pts = [
        {"lat": 30, "lng": 70},
        {"lat": 30, "lng": 80},
        {"lat": 25, "lng": 80},
        {"lat": 25, "lng": 70},
    ]
    assert point_in_geo_polygon(28.6, 77.2, pts) is True   # Delhi-ish


def test_geo_polygon_outside() -> None:
    pts = [
        {"lat": 30, "lng": 70},
        {"lat": 30, "lng": 80},
        {"lat": 25, "lng": 80},
        {"lat": 25, "lng": 70},
    ]
    assert point_in_geo_polygon(0, 0, pts) is False


# ── DIAGRAM_HOTSPOT handler ──────────────────────────────────────────────────


def _hotspot_payload() -> dict:
    return {
        "stem": "Click on the right ventricle of the heart.",
        "image_media_id": "media-1",
        "hotspots": [
            {
                "id": "rv",
                "label": "Right ventricle",
                "shape": {"kind": "circle", "cx": 100, "cy": 200, "r": 30, "tolerance_px": 0},
                "is_correct": True,
            },
            {
                "id": "lv",
                "label": "Left ventricle",
                "shape": {"kind": "circle", "cx": 200, "cy": 200, "r": 30, "tolerance_px": 0},
                "is_correct": False,
            },
        ],
    }


def test_hotspot_correct_click() -> None:
    h = DiagramHotspotHandler()
    res = _run(h.evaluate(
        _hotspot_payload(), {"question_id": "q1", "click_x": 100, "click_y": 200}, "en",
    ))
    assert res.status == "CORRECT"


def test_hotspot_wrong_hotspot() -> None:
    h = DiagramHotspotHandler()
    res = _run(h.evaluate(
        _hotspot_payload(), {"question_id": "q1", "click_x": 200, "click_y": 200}, "en",
    ))
    assert res.status == "INCORRECT"


def test_hotspot_miss_all() -> None:
    h = DiagramHotspotHandler()
    res = _run(h.evaluate(
        _hotspot_payload(), {"question_id": "q1", "click_x": 0, "click_y": 0}, "en",
    ))
    assert res.status == "INCORRECT"


def test_hotspot_unattempted() -> None:
    h = DiagramHotspotHandler()
    res = _run(h.evaluate(
        _hotspot_payload(), {"question_id": "q1"}, "en",
    ))
    assert res.status == "UNATTEMPTED"


# ── DIAGRAM_LABEL handler ────────────────────────────────────────────────────


def _label_payload() -> dict:
    return {
        "stem": "Match each marker on the cell to its label.",
        "image_media_id": "media-1",
        "markers": [
            {"id": "m1", "x": 10, "y": 10},
            {"id": "m2", "x": 20, "y": 20},
            {"id": "m3", "x": 30, "y": 30},
        ],
        "labels": [
            {"id": "l1", "text": "Nucleus"},
            {"id": "l2", "text": "Mitochondria"},
            {"id": "l3", "text": "Ribosome"},
            {"id": "l4", "text": "Cell wall (distractor)"},
        ],
        "correct_pairs": [
            {"marker_id": "m1", "label_id": "l1"},
            {"marker_id": "m2", "label_id": "l2"},
            {"marker_id": "m3", "label_id": "l3"},
        ],
        "partial_credit": True,
    }


def test_label_all_correct() -> None:
    h = DiagramLabelHandler()
    res = _run(h.evaluate(_label_payload(), {
        "question_id": "q1",
        "pairs": [
            {"marker_id": "m1", "label_id": "l1"},
            {"marker_id": "m2", "label_id": "l2"},
            {"marker_id": "m3", "label_id": "l3"},
        ],
    }, "en"))
    assert res.status == "CORRECT"
    assert res.matched_count == 3


def test_label_partial() -> None:
    h = DiagramLabelHandler()
    res = _run(h.evaluate(_label_payload(), {
        "question_id": "q1",
        "pairs": [
            {"marker_id": "m1", "label_id": "l1"},
            {"marker_id": "m2", "label_id": "l4"},  # wrong distractor
            {"marker_id": "m3", "label_id": "l3"},
        ],
    }, "en"))
    assert res.status == "PARTIAL_CORRECT"
    assert res.matched_count == 2


def test_label_no_partial_when_disabled() -> None:
    payload = _label_payload()
    payload["partial_credit"] = False
    h = DiagramLabelHandler()
    res = _run(h.evaluate(payload, {
        "question_id": "q1",
        "pairs": [
            {"marker_id": "m1", "label_id": "l1"},  # only 1 of 3 correct
        ],
    }, "en"))
    assert res.status == "INCORRECT"


# ── MAP_LOCATION handler ─────────────────────────────────────────────────────


def _map_payload() -> dict:
    return {
        "stem": "Click on the location of New Delhi.",
        "base_map": "india",
        "correct_region": {
            "points": [
                {"lat": 29, "lng": 76},
                {"lat": 29, "lng": 78},
                {"lat": 28, "lng": 78},
                {"lat": 28, "lng": 76},
            ]
        },
    }


def test_map_inside_region() -> None:
    h = MapLocationHandler()
    res = _run(h.evaluate(_map_payload(), {
        "question_id": "q1", "click_lat": 28.6, "click_lng": 77.2,
    }, "en"))
    assert res.status == "CORRECT"


def test_map_outside_region() -> None:
    h = MapLocationHandler()
    res = _run(h.evaluate(_map_payload(), {
        "question_id": "q1", "click_lat": 0.0, "click_lng": 0.0,
    }, "en"))
    assert res.status == "INCORRECT"


def test_map_unattempted() -> None:
    h = MapLocationHandler()
    res = _run(h.evaluate(_map_payload(), {"question_id": "q1"}, "en"))
    assert res.status == "UNATTEMPTED"


# Radius model — the shape the seed authors (target point + tolerance_deg).


def _map_radius_payload() -> dict:
    # Ahmedabad with a 0.5° (~55 km) tolerance — no polygon, no stem.
    return {
        "target_lat": 23.02,
        "target_lng": 72.57,
        "tolerance_deg": 0.5,
        "label": "Ahmedabad",
    }


def test_map_radius_within_tolerance() -> None:
    h = MapLocationHandler()
    res = _run(h.evaluate(_map_radius_payload(), {
        "question_id": "q1", "click_lat": 23.0, "click_lng": 72.6,
    }, "en"))
    assert res.status == "CORRECT"


def test_map_radius_outside_tolerance() -> None:
    h = MapLocationHandler()
    res = _run(h.evaluate(_map_radius_payload(), {
        "question_id": "q1", "click_lat": 23.8, "click_lng": 69.5,
    }, "en"))
    assert res.status == "INCORRECT"


# ── PICTORIAL_IDENTIFY handler ───────────────────────────────────────────────


def _pictorial_payload() -> dict:
    return {
        "stem": "Identify the species shown.",
        "image_media_id": "media-1",
        "options": [
            {"id": "A", "text": "Tiger"},
            {"id": "B", "text": "Lion"},
            {"id": "C", "text": "Cheetah"},
            {"id": "D", "text": "Leopard"},
        ],
        "correct_id": "C",
    }


def test_pictorial_correct() -> None:
    h = PictorialIdentifyHandler()
    res = _run(h.evaluate(_pictorial_payload(), {
        "question_id": "q1", "selected_id": "C",
    }, "en"))
    assert res.status == "CORRECT"


def test_pictorial_incorrect() -> None:
    h = PictorialIdentifyHandler()
    res = _run(h.evaluate(_pictorial_payload(), {
        "question_id": "q1", "selected_id": "A",
    }, "en"))
    assert res.status == "INCORRECT"


def test_pictorial_unattempted() -> None:
    h = PictorialIdentifyHandler()
    res = _run(h.evaluate(_pictorial_payload(), {"question_id": "q1"}, "en"))
    assert res.status == "UNATTEMPTED"


# ── Protocol conformance ─────────────────────────────────────────────────────


def test_visual_handlers_protocol_attrs() -> None:
    for cls in (
        DiagramHotspotHandler, DiagramLabelHandler,
        MapLocationHandler, PictorialIdentifyHandler,
    ):
        h = cls()
        for attr in PROTOCOL_ATTRS:
            assert hasattr(h, attr), f"{cls.__name__} missing attr {attr}"
        for method in PROTOCOL_METHODS:
            assert callable(getattr(h, method)), \
                f"{cls.__name__} missing method {method}"
        assert h.evaluation_mode == "DETERMINISTIC"
        assert "image" in h.media_kinds
