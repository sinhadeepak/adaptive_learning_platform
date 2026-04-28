"""Capture request/response fixtures from the *old* services.

Run BEFORE a merge sprint, while the old stack (`make dev`) is up:

    uv run python -m tests.consolidation.record analytics notification

This hits each route in `inventory.ROUTES[<svc>]` against the old
service on its known port and writes a recording per route to
`recordings/<svc>/<slug>.json`.

Path placeholders (`{cohortId}`, `{userId}`, …) come from
`recordings/<svc>/__params__.json`. Create that file by hand the first
time you record a service — the seed-restore script gives you stable
ids to plug in.

This script does NOT verify correctness. It just records what the old
service returns. The contract tests then assert the *new* service
returns the same. So this is the ground truth — record against a
freshly-seeded local stack.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

import httpx

from tests.consolidation.inventory import ROUTES

OLD_SERVICE_PORTS: dict[str, int] = {
    "auth": 38001,
    "user_profile": 38002,
    "content": 38003,
    "catalog": 38004,
    "search": 38005,
    "analytics": 38006,
    "payment": 38007,
    "institution": 38008,
    "notification": 38009,
    "adaptive_engine": 38010,
    "doubts": 38011,
}

RECORDINGS_DIR = Path(__file__).parent / "recordings"


def slugify(method: str, path: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "_", f"{method}_{path}").strip("_")


def expand_path(path: str, params: dict[str, str]) -> str:
    return re.sub(
        r"\{(\w+)\}",
        lambda m: params.get(m.group(1), f"<missing-{m.group(1)}>"),
        path,
    )


def record_service(svc: str, base_url: str, params: dict[str, str], headers: dict[str, str]) -> int:
    out_dir = RECORDINGS_DIR / svc
    out_dir.mkdir(parents=True, exist_ok=True)
    written = 0
    with httpx.Client(base_url=base_url, headers=headers, timeout=10.0) as client:
        for method, path_template, body in ROUTES.get(svc, []):
            expanded = expand_path(path_template, params)
            try:
                resp = client.request(method, expanded, json=body)
            except httpx.HTTPError as e:
                print(f"  ! {method} {expanded}: {e}", file=sys.stderr)
                continue
            try:
                resp_body: Any = resp.json()
            except ValueError:
                resp_body = resp.text
            recording = {
                "old_service": svc,
                "route_key": f"{method} {path_template}",
                "request": {
                    "method": method,
                    "path": expanded,
                    "headers": {k: v for k, v in headers.items() if k.lower() != "authorization"} | {"authorization": "<redacted>"},
                    "body": body,
                },
                "response": {
                    "status": resp.status_code,
                    "body": resp_body,
                },
            }
            slug = slugify(method, path_template)
            (out_dir / f"{slug}.json").write_text(json.dumps(recording, indent=2, sort_keys=True))
            written += 1
            print(f"  ✓ {method} {expanded} → {resp.status_code}")
    return written


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("services", nargs="+", help="Old services to record (e.g. analytics notification)")
    parser.add_argument("--auth-token", default="", help="Bearer token for the recording session")
    args = parser.parse_args()

    headers = {"authorization": f"Bearer {args.auth_token}"} if args.auth_token else {}

    total = 0
    for svc in args.services:
        if svc not in ROUTES:
            print(f"unknown service: {svc!r} (known: {sorted(ROUTES)})", file=sys.stderr)
            return 2
        port = OLD_SERVICE_PORTS.get(svc)
        if not port:
            print(f"no port mapping for {svc!r}", file=sys.stderr)
            return 2
        params_file = RECORDINGS_DIR / svc / "__params__.json"
        params = json.loads(params_file.read_text()) if params_file.exists() else {}
        print(f"→ recording {svc} from http://localhost:{port}")
        total += record_service(svc, f"http://localhost:{port}", params, headers)
    print(f"recorded {total} routes across {len(args.services)} services → {RECORDINGS_DIR}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
