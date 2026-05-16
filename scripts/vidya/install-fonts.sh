#!/usr/bin/env bash
# =============================================================
# Vidya v1 · font installer
# -------------------------------------------------------------
# Downloads Instrument Serif (SIL OFL · Google Fonts) and Geist
# + Geist Mono (SIL OFL · Vercel) and lays them out under each
# web app's public/fonts/vidya/ folder and apps/mobile/assets/fonts/.
#
# Idempotent — re-running is safe (skips files that already exist
# unless --force is passed).
#
# Run once per fresh checkout / CI cache miss:
#
#   bash scripts/vidya/install-fonts.sh
#   bash scripts/vidya/install-fonts.sh --force   # re-download
#
# Required tools: curl, unzip. (Both ship with macOS + most Linux.)
# =============================================================

set -euo pipefail

FORCE=0
if [[ "${1:-}" == "--force" ]]; then
  FORCE=1
fi

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

WEB_APPS=("web-student" "web-portal" "web-admin")
MOBILE_FONTS_DIR="$ROOT/apps/mobile/assets/fonts"

GEIST_VERSION="1.3.1"
INSTRUMENT_VERSION="2.000"

note()  { printf "\033[36m→\033[0m %s\n" "$*"; }
ok()    { printf "\033[32m✓\033[0m %s\n" "$*"; }
warn()  { printf "\033[33m!\033[0m %s\n" "$*"; }
die()   { printf "\033[31m✗\033[0m %s\n" "$*" >&2; exit 1; }

need_download() {
  local dest="$1"
  if [[ $FORCE -eq 1 ]]; then return 0; fi
  if [[ -s "$dest" ]]; then return 1; fi
  return 0
}

# ─── Instrument Serif ──────────────────────────────────────
# Source: https://github.com/google/fonts/tree/main/ofl/instrumentserif
INSTRUMENT_REGULAR_URL="https://raw.githubusercontent.com/google/fonts/main/ofl/instrumentserif/InstrumentSerif-Regular.ttf"
INSTRUMENT_ITALIC_URL="https://raw.githubusercontent.com/google/fonts/main/ofl/instrumentserif/InstrumentSerif-Italic.ttf"

# ─── Geist + Geist Mono ────────────────────────────────────
# Source: npm "geist" — Vercel's official distribution.
GEIST_PKG_URL="https://registry.npmjs.org/geist/-/geist-${GEIST_VERSION}.tgz"

stage_dir="$TMP/stage"
mkdir -p "$stage_dir"

# ── Download Instrument Serif (TTF; we convert to woff2 via fonttools)
note "Downloading Instrument Serif v${INSTRUMENT_VERSION}…"
curl -fsSL "$INSTRUMENT_REGULAR_URL" -o "$stage_dir/InstrumentSerif-Regular.ttf" \
  || die "Failed to fetch Instrument Serif Regular (network?)"
curl -fsSL "$INSTRUMENT_ITALIC_URL"  -o "$stage_dir/InstrumentSerif-Italic.ttf" \
  || die "Failed to fetch Instrument Serif Italic"

# Convert TTF→WOFF2 if fonttools is available; otherwise ship TTF.
if python3 -c "import fontTools, brotli" 2>/dev/null; then
  note "Converting Instrument Serif TTF → WOFF2…"
  STAGE_DIR="$stage_dir" python3 - <<'PY'
import os
from fontTools.ttLib import TTFont
stage = os.environ["STAGE_DIR"]
for face in ("InstrumentSerif-Regular", "InstrumentSerif-Italic"):
    src = os.path.join(stage, face + ".ttf")
    dst = os.path.join(stage, face + ".woff2")
    f = TTFont(src)
    f.flavor = "woff2"
    f.save(dst)
PY
  ok "Instrument Serif staged as WOFF2"
else
  warn "fontTools+brotli not installed (pip install --break-system-packages fonttools brotli) —"
  warn "shipping Instrument Serif as TTF with .ttf extension; fonts.css falls back automatically."
  cp "$stage_dir/InstrumentSerif-Regular.ttf" "$stage_dir/InstrumentSerif-Regular-fallback.ttf"
  cp "$stage_dir/InstrumentSerif-Italic.ttf"  "$stage_dir/InstrumentSerif-Italic-fallback.ttf"
fi

# ── Download Geist + Geist Mono (npm tarball)
note "Downloading geist@${GEIST_VERSION} (Vercel)…"
curl -fsSL "$GEIST_PKG_URL" -o "$stage_dir/geist.tgz" \
  || die "Failed to fetch geist npm package (network?)"
mkdir -p "$stage_dir/geist"
tar -xzf "$stage_dir/geist.tgz" -C "$stage_dir/geist" --strip-components=1

# Vercel's distribution layout:
#   package/dist/fonts/geist-sans/Geist-Variable.woff2
#   package/dist/fonts/geist-mono/GeistMono-Variable.woff2
GEIST_SANS="$stage_dir/geist/dist/fonts/geist-sans/Geist-Variable.woff2"
GEIST_MONO="$stage_dir/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2"
if [[ ! -s "$GEIST_SANS" || ! -s "$GEIST_MONO" ]]; then
  # Fallback path if Vercel changes layout
  GEIST_SANS=$(find "$stage_dir/geist" -name 'Geist*Variable*.woff2' | head -1)
  GEIST_MONO=$(find "$stage_dir/geist" -name 'GeistMono*Variable*.woff2' | head -1)
fi
[[ -s "$GEIST_SANS" ]] || die "Geist sans variable woff2 not found in npm package"
[[ -s "$GEIST_MONO" ]] || die "Geist mono variable woff2 not found in npm package"
cp "$GEIST_SANS" "$stage_dir/Geist-Variable.woff2"
cp "$GEIST_MONO" "$stage_dir/GeistMono-Variable.woff2"
ok "Geist + Geist Mono staged"

# ── Distribute to each web app
for app in "${WEB_APPS[@]}"; do
  dest="$ROOT/apps/$app/public/fonts/vidya"
  mkdir -p "$dest"
  for f in InstrumentSerif-Regular.woff2 InstrumentSerif-Italic.woff2 Geist-Variable.woff2 GeistMono-Variable.woff2; do
    if need_download "$dest/$f"; then
      cp "$stage_dir/$f" "$dest/$f"
      ok "  $app ← $f"
    else
      note "  $app skipped $f (exists; pass --force to overwrite)"
    fi
  done
done

# ── Distribute to Flutter mobile (TTF preferred — Flutter prefers TTF/OTF)
note "Installing Flutter fonts (TTF)…"
mkdir -p "$MOBILE_FONTS_DIR"
cp "$stage_dir/InstrumentSerif-Regular.ttf" "$MOBILE_FONTS_DIR/InstrumentSerif-Regular.ttf" 2>/dev/null \
  || cp "$stage_dir/InstrumentSerif-Regular.woff2" "$MOBILE_FONTS_DIR/InstrumentSerif-Regular.ttf"

# Pull Geist TTF from the same npm package (Vercel ships both)
GEIST_SANS_TTF=$(find "$stage_dir/geist" -name 'Geist-Regular*.ttf' -o -name 'Geist*Regular.ttf' | head -1)
GEIST_MONO_TTF=$(find "$stage_dir/geist" -name 'GeistMono-Regular*.ttf' -o -name 'GeistMono*Regular.ttf' | head -1)
if [[ -s "$GEIST_SANS_TTF" ]]; then
  cp "$GEIST_SANS_TTF" "$MOBILE_FONTS_DIR/Geist-Regular.ttf"
else
  warn "Geist TTF not found in npm package — Flutter will fall back to system. Check vercel/geist release."
fi
if [[ -s "$GEIST_MONO_TTF" ]]; then
  cp "$GEIST_MONO_TTF" "$MOBILE_FONTS_DIR/GeistMono-Regular.ttf"
fi

# Also pull common Geist weights if available
for weight_file in Geist-Medium.ttf Geist-SemiBold.ttf; do
  src=$(find "$stage_dir/geist" -name "$weight_file" | head -1)
  [[ -n "$src" ]] && cp "$src" "$MOBILE_FONTS_DIR/$weight_file"
done

ok "Mobile fonts installed under apps/mobile/assets/fonts/"

echo ""
ok "Vidya font installation complete."
echo "  Web   : apps/{web-student,web-portal,web-admin}/public/fonts/vidya/"
echo "  Mobile: apps/mobile/assets/fonts/"
echo ""
echo "Next: pnpm dev (web) or flutter run (mobile) — fonts swap in automatically."
