# Vidya Design System

This folder contains the complete design system documentation for replacing the legacy Aurora v2 system across the Adaptive Learning Platform.

## Files in this folder

```
design-system/
├── 00_README.md                   ← Start here. Overview + how to integrate.
├── 01_tokens.md                   ← Token reference (every value, named).
├── 02_tokens.css                  ← Production CSS — drop into the web portals.
├── 03_tokens.dart                 ← Production Flutter — drop into the mobile app.
├── 04_components.md               ← 14 core components (anatomy + usage).
├── 05_migration_from_aurora.md    ← Aurora→Vidya migration playbook with scripts.
├── 06_accessibility.md            ← WCAG 2.2 AA targets, contrast tables.
└── README.md                      ← This file.
```

## Download this folder

In your project's chat, click the download icon on this folder, or run from the command line in your codebase:

```bash
# (You'll receive a zip via the chat download button)
unzip vidya-design-system.zip -d packages/
```

## What you do with it

1. **Read `00_README.md`** — 3 minutes. Understand the philosophy and integration path.
2. **Use `02_tokens.css`** as the canonical source for web. Replace `tokens.v2.css`.
3. **Use `03_tokens.dart`** as the canonical source for Flutter. Replace Aurora theme.
4. **Reference `04_components.md`** when rebuilding any component.
5. **Follow `05_migration_from_aurora.md`** for the day-by-day playbook with shell scripts.
6. **Verify against `06_accessibility.md`** before shipping.

## Versioning

- **v1.0** · May 2026 · this release
- Supersedes Aurora v2 (ADR-0028)
- Next: v1.1 will add Tamil + RTL Urdu support

## Owners

- Design lead: TBD
- Engineering lead (web): TBD
- Engineering lead (mobile): TBD
- A11y reviewer: TBD

Update this README with names before kickoff.
