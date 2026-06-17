"""Pydantic payload + response contracts for the 4 Visual & Spatial types."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


# ── Shape primitives (image-pixel space) ─────────────────────────────────────


class CircleShape(BaseModel):
    kind: Literal["circle"] = "circle"
    cx: int = Field(ge=0)  # image-pixel x
    cy: int = Field(ge=0)
    r: int = Field(gt=0)
    tolerance_px: int = Field(default=0, ge=0)


class RectShape(BaseModel):
    kind: Literal["rect"] = "rect"
    x: int = Field(ge=0)
    y: int = Field(ge=0)
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    tolerance_px: int = Field(default=0, ge=0)


class PolygonShape(BaseModel):
    kind: Literal["polygon"] = "polygon"
    points: list[tuple[int, int]] = Field(min_length=3, max_length=64)
    tolerance_px: int = Field(default=0, ge=0)


Shape = CircleShape | RectShape | PolygonShape


# ── DIAGRAM_HOTSPOT ──────────────────────────────────────────────────────────
# Click in correct hotspot → CORRECT.


class HotspotRegion(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    label: str = Field(min_length=1, max_length=200)  # translatable
    shape: Shape = Field(discriminator="kind")
    is_correct: bool


class DiagramHotspotPayload(BaseModel):
    stem: str = Field(min_length=8, max_length=2000)
    image_media_id: str  # FK → content_schema.content_media.id
    hotspots: list[HotspotRegion] = Field(min_length=2, max_length=20)
    explanation: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def _exactly_one_correct(self) -> "DiagramHotspotPayload":
        ids = {h.id for h in self.hotspots}
        if len(ids) != len(self.hotspots):
            raise ValueError("hotspot ids must be unique")
        correct = [h for h in self.hotspots if h.is_correct]
        if len(correct) != 1:
            raise ValueError(
                f"DIAGRAM_HOTSPOT requires exactly one is_correct=true hotspot; got {len(correct)}"
            )
        return self


class DiagramHotspotResponse(BaseModel):
    """Click coordinates normalised to image-pixel space by the
    frontend before submit (handles device pixel ratio + zoom)."""

    click_x: int | None = None
    click_y: int | None = None


# ── DIAGRAM_LABEL ────────────────────────────────────────────────────────────
# Markers + labels; reuses MATCH semantics for evaluation. Author places
# markers on image; defines a label list (with extras as distractors);
# links each marker to its correct label.


class Marker(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    x: int = Field(ge=0)  # image-pixel coords
    y: int = Field(ge=0)


class LabelOption(BaseModel):
    id: str = Field(min_length=1, max_length=40)
    text: str = Field(min_length=1, max_length=200)  # translatable


class MarkerLabelPair(BaseModel):
    marker_id: str
    label_id: str


class DiagramLabelPayload(BaseModel):
    stem: str = Field(min_length=8, max_length=2000)
    image_media_id: str
    markers: list[Marker] = Field(min_length=2, max_length=20)
    labels: list[LabelOption] = Field(min_length=2, max_length=20)  # may include distractors
    correct_pairs: list[MarkerLabelPair] = Field(min_length=2)
    partial_credit: bool = True
    explanation: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def _pairs_consistent(self) -> "DiagramLabelPayload":
        marker_ids = {m.id for m in self.markers}
        label_ids = {l.id for l in self.labels}
        if len(marker_ids) != len(self.markers):
            raise ValueError("marker ids must be unique")
        if len(label_ids) != len(self.labels):
            raise ValueError("label ids must be unique")

        seen_markers: set[str] = set()
        for p in self.correct_pairs:
            if p.marker_id not in marker_ids:
                raise ValueError(f"marker_id {p.marker_id!r} unknown")
            if p.label_id not in label_ids:
                raise ValueError(f"label_id {p.label_id!r} unknown")
            if p.marker_id in seen_markers:
                raise ValueError(f"marker_id {p.marker_id!r} paired twice")
            seen_markers.add(p.marker_id)
        unpaired = marker_ids - seen_markers
        if unpaired:
            raise ValueError(f"markers without correct pair: {sorted(unpaired)}")
        return self


class DiagramLabelResponse(BaseModel):
    pairs: list[MarkerLabelPair] = Field(default_factory=list)


# ── MAP_LOCATION ─────────────────────────────────────────────────────────────
# Special case of HOTSPOT using a base map. Coordinates in lat/long.


class GeoPoint(BaseModel):
    lat: float = Field(ge=-90.0, le=90.0)
    lng: float = Field(ge=-180.0, le=180.0)


class GeoPolygon(BaseModel):
    """Closed polygon in lat/long coordinates."""

    points: list[GeoPoint] = Field(min_length=3, max_length=128)


class MapLocationPayload(BaseModel):
    # stem lives on the question row; optional here. (Authoring may also
    # embed it in the payload, so we still accept it.)
    stem: str | None = Field(default=None, max_length=2000)
    base_map: Literal["india", "world", "custom"] = "india"
    custom_map_media_id: str | None = None  # if base_map == "custom"
    # Two ways to specify the correct answer (at least one is required):
    #   1. Radius model (preferred, what the seed authors): a target point
    #      + tolerance in decimal degrees. A click is correct when it falls
    #      within `tolerance_deg` of (target_lat, target_lng). This is the
    #      "drop a pin near the place" model — exact precision isn't needed.
    #   2. Polygon model: a closed region the click must fall inside.
    target_lat: float | None = Field(default=None, ge=-90.0, le=90.0)
    target_lng: float | None = Field(default=None, ge=-180.0, le=180.0)
    tolerance_deg: float | None = Field(default=None, gt=0.0, le=45.0)
    correct_region: GeoPolygon | None = None
    label: str | None = None  # human name of the target (authoring aid)
    explanation: str | None = Field(default=None, max_length=4000)

    def has_radius_target(self) -> bool:
        return (
            self.target_lat is not None
            and self.target_lng is not None
            and self.tolerance_deg is not None
        )

    @model_validator(mode="after")
    def _consistency(self) -> "MapLocationPayload":
        if self.base_map == "custom" and not self.custom_map_media_id:
            raise ValueError("base_map='custom' requires custom_map_media_id")
        if self.base_map != "custom" and self.custom_map_media_id:
            raise ValueError(
                "custom_map_media_id only allowed when base_map='custom'"
            )
        if not self.has_radius_target() and self.correct_region is None:
            raise ValueError(
                "MAP_LOCATION requires either target_lat+target_lng+"
                "tolerance_deg or correct_region"
            )
        return self


class MapLocationResponse(BaseModel):
    click_lat: float | None = Field(default=None, ge=-90.0, le=90.0)
    click_lng: float | None = Field(default=None, ge=-180.0, le=180.0)


# ── PICTORIAL_IDENTIFY ───────────────────────────────────────────────────────
# Image + 4 text options; pick which one is shown. MCQ-equivalent.


class PictorialIdentifyPayload(BaseModel):
    stem: str = Field(min_length=8, max_length=2000)
    image_media_id: str
    options: list["PictorialOption"] = Field(min_length=2, max_length=8)
    correct_id: str
    explanation: str | None = Field(default=None, max_length=4000)

    @model_validator(mode="after")
    def _correct_in_options(self) -> "PictorialIdentifyPayload":
        ids = {o.id for o in self.options}
        if len(ids) != len(self.options):
            raise ValueError("option ids must be unique")
        if self.correct_id not in ids:
            raise ValueError(f"correct_id {self.correct_id!r} not in options")
        return self


class PictorialOption(BaseModel):
    id: str = Field(min_length=1, max_length=8)
    text: str = Field(min_length=1, max_length=500)


class PictorialIdentifyResponse(BaseModel):
    selected_id: str | None = None


PictorialIdentifyPayload.model_rebuild()
