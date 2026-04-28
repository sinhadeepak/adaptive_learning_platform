"""HTTP middlewares for Auth.

GAP-27 — log `X-Client-Version` on every request so a backward-compat regression
can be traced to the client build that triggered it. Sprint 1 commitment lives in
Auth (the rev-proxy fallback) until the dedicated gateway lands in Sprint 3.
"""

from __future__ import annotations

import logging
import time
from typing import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

log = logging.getLogger(__name__)


class ClientVersionLogMiddleware(BaseHTTPMiddleware):
    """Logs every request with method, path, status, latency, and the client build.

    Header convention: `X-Client-Version: <surface>/<version>`
        e.g. `web-student/0.4.2`, `mobile-android/0.1.0+1`, `web-portal/0.3.1`.
    Empty / missing header logs as `unknown`.
    """

    async def dispatch(  # type: ignore[override]
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        start = time.perf_counter()
        response = await call_next(request)
        elapsed_ms = (time.perf_counter() - start) * 1000.0
        client_version = request.headers.get("x-client-version", "unknown")
        # Skip noisy health probes — they can flood logs at 10–60 RPS in k8s.
        if request.url.path not in {"/health", "/ready"}:
            log.info(
                "http.request",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "elapsed_ms": round(elapsed_ms, 2),
                    "client_version": client_version,
                    "client_ip": request.client.host if request.client else None,
                },
            )
        return response
