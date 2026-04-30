"""Prompt template registry — versioned YAML loader.

Per ADR-0019 §"Prompt template registry". Templates stored as YAML in
`prompts/{touchpoint}/{template_id}_v{version}.yaml`. Loaded at
startup; `(template_id, version)` must be passed explicitly to every
Gateway call (no implicit "latest").
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml
from pydantic import BaseModel, Field


class PromptTemplate(BaseModel):
    """One prompt template. Loaded from YAML; immutable after load."""

    id: str = Field(min_length=1, max_length=80)
    version: str = Field(
        pattern=r"^\d+\.\d+\.\d+$",  # semver — major.minor.patch
        description="Semver, e.g. '3.1.0'",
    )
    touchpoint: str = Field(min_length=1)
    description: str = Field(default="", max_length=500)
    system: str = Field(min_length=1)  # system prompt body
    few_shot: list[dict[str, Any]] = Field(default_factory=list)
    inputs: dict[str, dict[str, Any]] = Field(default_factory=dict)
    output_schema: str = Field(
        description="Reference to the Pydantic schema validating output, e.g. 'EssayEvaluationSchema'",
    )

    def render_system(self, inputs: dict[str, Any]) -> str:
        """Substitute {placeholders} in the system prompt with input values.

        Validation is strict: every {key} in the system string must be
        present in `inputs`; missing keys raise KeyError. Keys in
        inputs that aren't referenced are allowed (forwarded to the
        provider as-is via tool-call args).
        """
        try:
            return self.system.format(**inputs)
        except KeyError as e:
            raise KeyError(
                f"prompt template {self.id!r} v{self.version} expects input "
                f"{e.args[0]!r} but it was not provided"
            ) from e


class PromptRegistry:
    """In-process registry. Loaded once at service startup; immutable."""

    def __init__(self) -> None:
        self._templates: dict[tuple[str, str], PromptTemplate] = {}

    def load_directory(self, root: str | Path) -> int:
        """Walk a `prompts/` directory and register every `*.yaml`.

        Returns the number of templates loaded. Raises on any malformed
        YAML / failed Pydantic validation — we want loud failure at
        startup, not silent 'template missing at runtime'.
        """
        root_path = Path(root)
        if not root_path.exists():
            return 0
        count = 0
        for yaml_file in sorted(root_path.rglob("*.yaml")):
            raw = yaml.safe_load(yaml_file.read_text())
            if not isinstance(raw, dict):
                raise ValueError(
                    f"prompt template {yaml_file} did not parse to a dict"
                )
            template = PromptTemplate.model_validate(raw)
            key = (template.id, template.version)
            if key in self._templates:
                raise ValueError(
                    f"duplicate prompt template id={template.id} "
                    f"version={template.version} at {yaml_file}"
                )
            self._templates[key] = template
            count += 1
        return count

    def get(self, template_id: str, version: str) -> PromptTemplate:
        """Lookup by explicit (id, version). KeyError if unknown — no
        implicit 'latest' fallback per ADR-0019."""
        key = (template_id, version)
        if key not in self._templates:
            raise KeyError(
                f"prompt template not found: id={template_id!r} version={version!r}"
            )
        return self._templates[key]

    def all_ids(self) -> list[tuple[str, str]]:
        return sorted(self._templates.keys())

    def __len__(self) -> int:
        return len(self._templates)
