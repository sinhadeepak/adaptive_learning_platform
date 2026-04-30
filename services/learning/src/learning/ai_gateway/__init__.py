"""Phase 5 (P5-S38) — AI Gateway.

Single internal door for every LLM call platform-wide. Per ADR-0019.

Lives as a module inside `alp-learning` (not a 7th service). Consumed
by ai_authoring (S40), localisation (S43), evaluation (S42). Quiz Go
calls these consumers via /grading/grade or /content/ai/draft — never
the Gateway directly.

Public surface:
    AIGateway.call(touchpoint, prompt_template_id, prompt_template_version,
                   prompt_inputs, schema) -> validated schema instance.
"""

from __future__ import annotations

from learning.ai_gateway.gateway import AIGateway, AIGatewayError
from learning.ai_gateway.routing import RoutingConfig, TouchpointRouting, load_routing
from learning.ai_gateway.prompt_registry import PromptRegistry, PromptTemplate

__all__ = [
    "AIGateway",
    "AIGatewayError",
    "RoutingConfig",
    "TouchpointRouting",
    "load_routing",
    "PromptRegistry",
    "PromptTemplate",
]
