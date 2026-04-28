"""alp-learning — skeleton entrypoint.

Sprint A: boots an empty FastAPI app with /health.
Sprint C will move the following into sub-packages and mount them:

  services/catalog/src/catalog/*          → learning.catalog.*           (/catalog/*)
  services/content/src/content/*          → learning.content.*           (/content/*)
  services/doubts/src/doubts/*            → learning.doubts.*            (/doubts/*)
  services/search/src/search/*            → learning.search.*            (/search/*)
  services/adaptive-engine/src/adaptive_engine/*
                                          → learning.adaptive.*          (/adaptive/*)

HTTP clients between these (e.g. content→catalog authorize) become
in-process Python imports; the only remaining synchronous edges into
this service are alp-quiz, alp-engagement, and alp-payment.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from alp_telemetry import TraceContextMiddleware
from fastapi import FastAPI

from learning import __version__


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield


app = FastAPI(
    title="alp-learning",
    version=__version__,
    lifespan=lifespan,
)
app.add_middleware(TraceContextMiddleware, service_name="learning")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "learning", "version": __version__}
