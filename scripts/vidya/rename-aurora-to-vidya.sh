#!/usr/bin/env bash
# =============================================================
# Vidya v1 · Aurora → Vidya CSS token rename
# -------------------------------------------------------------
# Mechanical search-and-replace from Aurora v2 token names to
# Vidya v1 token names across .ts/.tsx/.js/.jsx/.css/.scss/.dart
# files. Run from repo root.
#
#   bash scripts/vidya/rename-aurora-to-vidya.sh         # apply
#   bash scripts/vidya/rename-aurora-to-vidya.sh --dry   # preview
#
# Excludes:
#   - packages/design-system/src/vidya/*          (canonical Vidya)
#   - packages/design-system/src/tokens.css       (Aurora source,
#     deleted in Phase 5)
#   - packages/design-system/src/tokens.v2.css    (ditto)
#   - packages/design-system/src/density.css      (ditto)
#   - packages/design-system/src/portals/*        (ditto)
#   - packages/design-system/src/tokens/*.ts      (Aurora TS source,
#     replaced/deleted in Phase 4/5)
#   - packages/design-tokens-flutter/lib/src/
#       {colors,typography,spacing,shape,elevation,motion,
#        breakpoints,density,aurora_*,persona,persona_theme}.dart
#                                                  (Aurora Flutter
#                                                   source — Phase 5)
#   - packages/design-tokens-flutter/lib/src/vidya/*
#   - docs/, node_modules/, dist/, build/, .git/
#
# This is idempotent: re-running produces no new diff.
# =============================================================

set -euo pipefail

DRY=0
if [[ "${1:-}" == "--dry" || "${1:-}" == "--dry-run" ]]; then
  DRY=1
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# ─── File discovery ─────────────────────────────────────────
mapfile -t FILES < <(
  find apps packages \
    -type f \
    \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' \
       -o -name '*.css' -o -name '*.scss' -o -name '*.dart' \) \
    -not -path '*/node_modules/*' \
    -not -path '*/dist/*' \
    -not -path '*/build/*' \
    -not -path '*/.dart_tool/*' \
    -not -path 'packages/design-system/src/vidya/*' \
    -not -path 'packages/design-system/src/tokens.css' \
    -not -path 'packages/design-system/src/tokens.v2.css' \
    -not -path 'packages/design-system/src/density.css' \
    -not -path 'packages/design-system/src/portals/*' \
    -not -path 'packages/design-system/src/tokens/*' \
    -not -path 'packages/design-tokens-flutter/lib/src/vidya/*' \
    -not -name 'aurora_*.dart' \
    -not -path 'packages/design-tokens-flutter/lib/src/colors.dart' \
    -not -path 'packages/design-tokens-flutter/lib/src/typography.dart' \
    -not -path 'packages/design-tokens-flutter/lib/src/spacing.dart' \
    -not -path 'packages/design-tokens-flutter/lib/src/shape.dart' \
    -not -path 'packages/design-tokens-flutter/lib/src/elevation.dart' \
    -not -path 'packages/design-tokens-flutter/lib/src/motion.dart' \
    -not -path 'packages/design-tokens-flutter/lib/src/breakpoints.dart' \
    -not -path 'packages/design-tokens-flutter/lib/src/density.dart' \
    -not -path 'packages/design-tokens-flutter/lib/src/persona.dart' \
    -not -path 'packages/design-tokens-flutter/lib/src/persona_theme.dart'
)

echo "Discovered ${#FILES[@]} candidate files"

# ─── Rename table ───────────────────────────────────────────
# Pairs of (aurora_token vidya_token). ORDER MATTERS: longest
# / most-specific patterns first so prefix overlaps don't clash
# (e.g. --aurora-ai-soft before --aurora-ai).
#
# Each Aurora token is treated as a literal string. sed -E is
# used elsewhere; here we use plain string sed to avoid regex
# escapes for the leading dashes.
RENAMES=(
  # ── Aurora compound tokens (do FIRST — soft variants before bases)
  '--aurora-ai-soft|--gold-soft'
  '--aurora-celebration-soft|--gold-soft'
  '--aurora-progress-soft|--accent-soft'
  '--aurora-ai|--gold'
  '--aurora-celebration|--gold'
  '--aurora-progress|--accent'
  '--aurora-tone-amber|--warn'
  '--aurora-tone-cyan|--info'
  '--aurora-tone-green|--good'
  '--aurora-tone-pink|--bad'
  '--aurora-tone-violet|--accent'
  '--aurora-500|--gold'

  # ── Color- compounds — soft/bg variants before bases
  '--color-ai-soft|--gold-soft'
  '--color-ai-accent|--gold-2'
  '--color-ai|--gold'
  '--color-amber-dark|--gold-2'
  '--color-amber-bg|--warn-soft'
  '--color-amber|--warn'
  '--color-blue-bg|--info-soft'
  '--color-blue2|--info'
  '--color-blue|--info'
  '--color-danger|--bad'
  '--color-developing|--m-dev'
  '--color-faint|--ink-4'
  '--color-green-bg|--good-soft'
  '--color-green|--good'
  '--color-grey-bg|--paper-2'
  '--color-purple-bg|--accent-soft'
  '--color-purple|--accent'
  '--color-red-bg|--bad-soft'
  '--color-red|--bad'
  '--color-strong|--m-strong'
  '--color-success|--good'
  '--color-weak|--m-weak'

  # ── Surfaces
  '--bg-surface1|--paper-2'
  '--bg-surface2|--card'
  '--bg-surface3|--paper-2'
  '--bg-surface4|--paper-2'
  '--bg-surface|--card'
  '--bg-elevated|--card'
  '--bg-hover|--paper-2'
  '--bg-active|--accent-soft'
  '--bg-subtle|--paper-2'
  '--bg-card|--card'
  '--bg-amber|--warn-soft'
  '--bg-green|--good-soft'
  '--bg-red|--bad-soft'
  '--bg-blue|--info-soft'
  '--bg-purple|--accent-soft'
  '--bg-danger|--bad-soft'
  '--bg-success|--good-soft'
  '--bg-base|--paper'

  # ── Text
  '--text-primary|--ink'
  '--text-secondary|--ink-2'
  '--text-muted|--ink-3'
  '--text-faint|--ink-4'
  '--text-danger|--bad'
  '--text-success|--good'

  # ── Neutral ramp
  '--neutral-900|--ink'
  '--neutral-800|--ink-2'
  '--neutral-700|--ink-2'
  '--neutral-600|--ink-3'
  '--neutral-500|--ink-3'
  '--neutral-400|--ink-4'
  '--neutral-300|--ink-4'
  '--neutral-200|--rule-2'
  '--neutral-100|--rule'
  '--neutral-50|--paper-2'
  '--neutral-0|--paper'

  # ── Brand
  '--brand-50|--accent-soft'
  '--brand-100|--accent-soft'
  '--brand-500|--accent'
  '--brand-600|--accent'
  '--brand-700|--accent-2'

  # ── Shadow tokens
  '--sh-xs|--shadow-xs'
  '--sh-sm|--shadow-sm'
  '--sh-md|--shadow-md'
  '--sh-lg|--shadow-lg'
  '--sh-xl|--shadow-lg'

  # ── Typography
  '--font-junior-display|--font-display'

  # ── Border / surface aliases used by app-level stylesheets
  '--border-strong|--rule-2'
  '--border-default|--rule'
  '--border-subtle|--rule'
  '--border-faint|--rule'
  '--border|--rule'
  '--surface-elev2|--card'
  '--surface-elev1|--card'
  '--surface-3|--paper-2'
  '--surface-2|--paper-2'
)

# ─── Apply ──────────────────────────────────────────────────
total_subs=0
files_touched=0

for f in "${FILES[@]}"; do
  # Build a single sed command with all substitutions for this file.
  # Using plain s|FROM|TO|g — none of our tokens contain pipes.
  sed_cmds=()
  for pair in "${RENAMES[@]}"; do
    from="${pair%%|*}"
    to="${pair##*|}"
    sed_cmds+=("-e" "s|${from}|${to}|g")
  done

  if [[ $DRY -eq 1 ]]; then
    # Count substitutions without writing
    before=$(grep -cE -- '--brand-|--bg-(base|surface|elevated|hover|active|subtle|card|amber|green|red|blue|purple|danger|success)|--text-(primary|secondary|muted|faint|danger|success)|--neutral-|--aurora-|--color-(ai|amber|blue|danger|developing|faint|green|grey|purple|red|strong|success|weak)|--sh-|--font-junior-display' "$f" 2>/dev/null || true)
    if [[ ${before:-0} -gt 0 ]]; then
      echo "[dry] $f  ($before lines would change)"
      total_subs=$((total_subs + before))
      files_touched=$((files_touched + 1))
    fi
  else
    # Apply in-place. Skip files unaffected to avoid no-op mtime churn.
    new_content=$(sed "${sed_cmds[@]}" "$f")
    if [[ "$new_content" != "$(cat "$f")" ]]; then
      printf '%s' "$new_content" > "$f"
      files_touched=$((files_touched + 1))
    fi
  fi
done

if [[ $DRY -eq 1 ]]; then
  echo ""
  echo "DRY-RUN: $files_touched files / ~$total_subs affected lines."
  echo "Re-run without --dry to apply."
else
  echo ""
  echo "✓ Vidya rename applied to $files_touched files."
  echo "  Verify residue: grep -rE -l --include='*.css' --include='*.ts' --include='*.tsx' --include='*.dart' \\"
  echo "    -- '--(brand-|bg-(base|surface|elevated)|text-(primary|secondary|muted|faint)|neutral-|aurora-|color-(ai|amber|green|red|blue|purple)|sh-(xs|sm|md|lg|xl))' \\"
  echo "    apps/ packages/"
fi
