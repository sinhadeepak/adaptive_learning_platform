"""Pure-stdlib geometry helpers for visual handlers.

Point-in-shape evaluators for the 4 visual types. No numpy, no shapely.

Image-pixel space is (0,0)-top-left; pixel coords are integers. Lat/long
space is decimal degrees; haversine not used in v1 — we treat the
polygon as planar in (lat, lng) which is fine for the 1-3 km hotspot
tolerances exam questions tend to use.
"""

from __future__ import annotations

from typing import Any


def point_in_circle(
    px: int, py: int, *, cx: int, cy: int, r: int, tolerance: int = 0,
) -> bool:
    """Inside or on the circle when distance ≤ r + tolerance."""
    dx = px - cx
    dy = py - cy
    limit = r + tolerance
    return (dx * dx + dy * dy) <= (limit * limit)


def point_in_rect(
    px: int, py: int, *, x: int, y: int, width: int, height: int, tolerance: int = 0,
) -> bool:
    """Axis-aligned. Tolerance expands the rect uniformly."""
    return (
        x - tolerance <= px <= x + width + tolerance
        and y - tolerance <= py <= y + height + tolerance
    )


def point_in_polygon(
    px: int, py: int, *, points: list[tuple[int, int]], tolerance: int = 0,
) -> bool:
    """Ray-casting algorithm. Tolerance approximated by also accepting
    points within `tolerance` distance of any edge.

    For convex + concave polygons. Pure stdlib.
    """
    if len(points) < 3:
        return False

    # Ray-cast: count edge crossings of a horizontal ray from (px, py).
    n = len(points)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = points[i]
        xj, yj = points[j]
        if ((yi > py) != (yj > py)) and (
            px < (xj - xi) * (py - yi) / (yj - yi + 1e-12) + xi
        ):
            inside = not inside
        j = i

    if inside:
        return True

    if tolerance > 0:
        # Edge proximity check.
        tol_sq = tolerance * tolerance
        for i in range(n):
            xi, yi = points[i]
            xj, yj = points[(i + 1) % n]
            if _point_segment_dist_sq(px, py, xi, yi, xj, yj) <= tol_sq:
                return True
    return False


def _point_segment_dist_sq(
    px: int, py: int, ax: int, ay: int, bx: int, by: int,
) -> float:
    """Squared distance from point (px, py) to segment AB."""
    dx = bx - ax
    dy = by - ay
    if dx == 0 and dy == 0:
        # Degenerate.
        return (px - ax) ** 2 + (py - ay) ** 2
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    fx = ax + t * dx
    fy = ay + t * dy
    return (px - fx) ** 2 + (py - fy) ** 2


def point_in_shape(px: int, py: int, shape: dict[str, Any]) -> bool:
    """Dispatch based on shape['kind']. Convenience for handlers
    operating on the Shape discriminated union from payloads."""
    kind = shape.get("kind")
    if kind == "circle":
        return point_in_circle(
            px, py,
            cx=shape["cx"], cy=shape["cy"], r=shape["r"],
            tolerance=shape.get("tolerance_px", 0),
        )
    if kind == "rect":
        return point_in_rect(
            px, py,
            x=shape["x"], y=shape["y"],
            width=shape["width"], height=shape["height"],
            tolerance=shape.get("tolerance_px", 0),
        )
    if kind == "polygon":
        return point_in_polygon(
            px, py,
            points=[tuple(p) for p in shape["points"]],
            tolerance=shape.get("tolerance_px", 0),
        )
    return False


# ── Geo (lat/long planar) ─────────────────────────────────────────────────────


def point_in_geo_polygon(
    lat: float, lng: float, points: list[dict[str, float]],
) -> bool:
    """Treat lat/lng as planar (x=lng, y=lat). For India-scale and
    smaller polygons this is accurate enough for hotspot grading;
    haversine-aware variant lands in a follow-up sprint if needed."""
    if len(points) < 3:
        return False
    n = len(points)
    inside = False
    j = n - 1
    for i in range(n):
        xi = points[i]["lng"]
        yi = points[i]["lat"]
        xj = points[j]["lng"]
        yj = points[j]["lat"]
        if ((yi > lat) != (yj > lat)) and (
            lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi
        ):
            inside = not inside
        j = i
    return inside
