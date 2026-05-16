# Vidya · Asset installer scripts

Helper scripts for the Vidya v1 design system. Run from repo root.

## `install-fonts.sh`

Downloads Instrument Serif (display, SIL OFL) + Geist + Geist Mono (UI + data, SIL OFL) and lays them out under each web app's `public/fonts/vidya/` folder and `apps/mobile/assets/fonts/`.

```bash
bash scripts/vidya/install-fonts.sh           # first install (skips existing)
bash scripts/vidya/install-fonts.sh --force   # re-download everything
```

Idempotent. Run once per fresh checkout (and in CI, gated on cache miss).

### Why a script and not commit the fonts

- woff2 binaries are large (~400 KB per app); inflate clone size and history.
- License review easier when source URL is in script, not opaque git blobs.
- Same script works locally, in CI, and in Docker build stages.

### CI integration

```yaml
# .github/workflows/web.yml (excerpt)
- name: Install Vidya fonts
  run: bash scripts/vidya/install-fonts.sh
- name: Build web apps
  run: pnpm -r --filter './apps/web-*' build
```

### License notes

| Family | License | Upstream |
|---|---|---|
| Instrument Serif | SIL OFL 1.1 | https://github.com/google/fonts/tree/main/ofl/instrumentserif |
| Geist + Geist Mono | SIL OFL 1.1 | https://www.npmjs.com/package/geist |

Both permit commercial use and redistribution. Keep this README updated if you bump versions in the script.

### Troubleshooting

- **`curl: Failed to fetch`** — your network blocks the upstream. Mirror the files to an internal artifact store and edit the URLs in the script.
- **`fontTools not installed`** — Instrument Serif ships as TTF instead of WOFF2 (slightly larger; browsers still load it). Install with `pip install fonttools brotli` if you want WOFF2.
- **Flutter doesn't see fonts** — confirm `apps/mobile/pubspec.yaml` declares the fonts under `flutter.fonts:` then run `flutter pub get`. The pubspec entry is added in the Vidya migration; see ADR-0034.
