#!/usr/bin/env python3
"""
aurora_migrate.py — bulk Aurora migration helper.

Applies the same mechanical transforms used in S4–M7 to a batch of
Dart screen files:

  1. Inject `import '../aurora/widgets/widgets.dart';` (or the right
     relative path) after the first `package:alp_design_tokens` or
     `package:flutter/material.dart` import, if not already present.

  2. `return Scaffold(`                      -> `return AuroraScaffold(`
  3. `appBar: AppBar(` (single-arg form)     -> `appBar: AuroraAppBar(`
  4. `appBar: AppBar(\n  title: Text('X'),`  -> `appBar: AuroraAppBar(\n  title: 'X',`
  5. `CircularProgressIndicator(...)`        -> `AuroraSpinner(size: 32)`
  6. Drops `backgroundColor: AlpColors.bg…,` lines INSIDE Scaffold + AppBar
     (Aurora theme drives the surface color).

Skips files that already import the Aurora barrel.

Usage:
    python3 scripts/aurora_migrate.py [file1.dart file2.dart …]
    python3 scripts/aurora_migrate.py --all   # all screens under lib/screens
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Iterable


AURORA_IMPORT = "import '../aurora/widgets/widgets.dart';"
AURORA_IMPORT_NESTED = "import '../../aurora/widgets/widgets.dart';"


def relative_aurora_import(path: Path) -> str:
    """Pick the right relative path based on screen depth."""
    parts = path.parts
    if "marketplace" in parts or "onboarding" in parts:
        return AURORA_IMPORT_NESTED
    return AURORA_IMPORT


def inject_aurora_import(src: str, import_line: str) -> str:
    if "aurora/widgets/widgets.dart" in src:
        return src

    # Anchor after the FIRST package import line.
    anchors = [
        r"import 'package:alp_design_tokens/alp_design_tokens\.dart';",
        r"import 'package:flutter/material\.dart';",
    ]
    for pat in anchors:
        m = re.search(pat, src)
        if m:
            end = m.end()
            return src[:end] + "\n" + import_line + src[end:]
    return src


def replace_scaffold(src: str) -> str:
    # `return Scaffold(` and `Scaffold(` at start of expression.
    src = re.sub(r"\breturn\s+Scaffold\(", "return AuroraScaffold(", src)
    return src


def replace_appbar(src: str) -> str:
    # `appBar: AppBar(` -> `appBar: AuroraAppBar(`
    src = re.sub(r"appBar:\s*AppBar\(", "appBar: AuroraAppBar(", src)
    return src


def collapse_appbar_title(src: str) -> str:
    """
    AuroraAppBar takes `title: 'X'` not `title: Text('X')`. Collapse the
    common patterns. Only matches simple single-argument Text widgets so
    we don't munge complex titles.
    """
    # title: Text('X')  ->  title: 'X'
    src = re.sub(
        r"(appBar:\s*AuroraAppBar\([^)]*?\btitle:\s*)Text\(\s*'([^']*?)'\s*\)",
        r"\1'\2'",
        src,
        flags=re.DOTALL,
    )
    # title: Text("X")  ->  title: "X"
    src = re.sub(
        r'(appBar:\s*AuroraAppBar\([^)]*?\btitle:\s*)Text\(\s*"([^"]*?)"\s*\)',
        r'\1"\2"',
        src,
        flags=re.DOTALL,
    )
    # title: const Text('X')  ->  title: 'X'
    src = re.sub(
        r"(appBar:\s*AuroraAppBar\([^)]*?\btitle:\s*)const\s+Text\(\s*'([^']*?)'\s*\)",
        r"\1'\2'",
        src,
        flags=re.DOTALL,
    )
    return src


def replace_spinner(src: str) -> str:
    # CircularProgressIndicator(color: AlpColors.colorAi)
    src = re.sub(
        r"CircularProgressIndicator\(\s*color:\s*AlpColors\.\w+\s*\)",
        "AuroraSpinner(size: 32)",
        src,
    )
    # const CircularProgressIndicator()
    src = re.sub(
        r"const\s+CircularProgressIndicator\(\s*\)",
        "const AuroraSpinner(size: 32)",
        src,
    )
    # bare CircularProgressIndicator() — rare
    src = re.sub(
        r"\bCircularProgressIndicator\(\s*\)",
        "AuroraSpinner(size: 32)",
        src,
    )
    return src


def strip_legacy_bg(src: str) -> str:
    """
    Drop the lines that hand-set backgroundColor to a legacy AlpColors
    constant inside Scaffold / AppBar. Aurora theme handles surface.
    """
    src = re.sub(
        r"^\s*backgroundColor:\s*AlpColors\.\w+\s*,\s*\n",
        "",
        src,
        flags=re.MULTILINE,
    )
    return src


def migrate(path: Path) -> tuple[bool, str]:
    """Returns (changed, summary). Writes back if changed."""
    src = path.read_text(encoding="utf-8")
    original = src

    src = inject_aurora_import(src, relative_aurora_import(path))
    src = replace_scaffold(src)
    src = replace_appbar(src)
    src = collapse_appbar_title(src)
    src = replace_spinner(src)
    src = strip_legacy_bg(src)

    if src == original:
        return False, "no changes"
    path.write_text(src, encoding="utf-8")
    return True, "migrated"


def collect_targets(root: Path) -> list[Path]:
    return sorted(
        p
        for p in root.rglob("*.dart")
        if "persona.dart" not in p.name
    )


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("files", nargs="*", help="Specific files. Default: --all.")
    ap.add_argument("--all", action="store_true", help="All files under lib/screens.")
    args = ap.parse_args(argv)

    root = Path(__file__).resolve().parents[1] / "lib" / "screens"
    if args.all:
        targets = collect_targets(root)
    else:
        targets = [Path(f).resolve() for f in args.files if Path(f).exists()]

    if not targets:
        ap.print_help()
        return 1

    changed = 0
    skipped = 0
    for t in targets:
        ok, msg = migrate(t)
        rel = t.relative_to(root.parent.parent) if t.is_relative_to(root.parent.parent) else t
        print(f"{'YES' if ok else ' . '}  {rel}  ({msg})")
        if ok:
            changed += 1
        else:
            skipped += 1
    print(f"\n{changed} changed, {skipped} skipped, {len(targets)} total")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
