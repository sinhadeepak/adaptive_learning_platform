import 'package:flutter/painting.dart';

/// Source of truth: docs/ui/01_StudentPortal_Web/00_design-system.css
/// Mirror of packages/design-system/src/tokens/colors.ts (web).
///
/// Dark theme + AI-cyan accent system. Strength buckets follow analytics
/// EWA in [0, 1]: ≥0.70 strong / 0.40-0.69 developing / 0.01-0.39 weak / 0
/// not_started — see [AlpColors.strengthStrong] etc.
class AlpColors {
  AlpColors._();

  // ── Backgrounds (--bg-base / --bg-surface1..4) ──────────────────────────
  static const Color bgBase = Color(0xFF07090F); // page background
  static const Color bgSurface1 = Color(0xFF0C1422); // sidebar, panels
  static const Color bgSurface2 = Color(0xFF101A30); // cards
  static const Color bgSurface3 = Color(0xFF162038); // inputs, stat tiles
  static const Color bgSurface4 = Color(0xFF1B2844); // nested element

  // ── Text (--text-primary / --text-secondary / --text-muted / --text-faint) ──
  static const Color textPrimary = Color(0xFFEEF2FF);
  static const Color textSecondary = Color(0xFFB8C5E0);
  static const Color textMuted = Color(0xFF7A8BAD);
  static const Color textFaint = Color(0xFF3E4D6A);

  // ── Borders (rgba on white at 7% / 11%) ────────────────────────────────
  static const Color borderDefault = Color(0x12FFFFFF);
  static const Color borderStrong = Color(0x1CFFFFFF);

  // ── Brand accent palette (--color-* in CSS) ────────────────────────────
  static const Color colorAi = Color(0xFF22D4EE); // AI features (◈ symbol)
  static const Color colorBlue = Color(0xFF4F87F6); // student / interactive
  static const Color colorBlue2 = Color(0xFF7B68EE); // gradient pair
  static const Color colorGreen = Color(0xFF10C47A); // success / strong / teacher
  static const Color colorAmber = Color(0xFFF5A623); // warning / streak / pending
  static const Color colorRed = Color(0xFFF43F5E); // error / weak / admin
  static const Color colorPurple = Color(0xFFA78BFA); // author / premium

  // ── Strength buckets (EWA → token) ─────────────────────────────────────
  static const Color strengthStrong = colorGreen; // EWA ≥ 0.70
  static const Color strengthDeveloping = colorBlue; // EWA 0.40–0.69
  static const Color strengthWeak = colorRed; // EWA 0.01–0.39
  static const Color strengthNotStarted = textFaint; // EWA = 0

  // ── Legacy semantic aliases ────────────────────────────────────────────
  // Mobile screens authored in Sprints 1–4 imported these names. Keep the
  // names; flip the values to the dark-theme equivalents.
  static const Color brandPrimary = colorBlue;
  static const Color brandPrimaryHover = Color(0xFF3D6FE0);
  static const Color brandSecondary = colorAi;
  static const Color brandTint = Color(0x1F4F87F6); // 12% blue
  static const Color focusRing = Color(0x594F87F6); // 35% blue glow

  static const Color successFg = colorGreen;
  static const Color successBg = Color(0x1F10C47A); // 12% green
  static const Color warningFg = colorAmber;
  static const Color warningBg = Color(0x1FF5A623);
  static const Color dangerFg = colorRed;
  static const Color dangerBg = Color(0x1FF43F5E);
  static const Color infoFg = colorAi;
  static const Color infoBg = Color(0x1A22D4EE); // 10% cyan

  static const Color surfacePrimary = bgSurface1; // was #FFFFFF in light theme
  static const Color surfaceSecondary = bgSurface2;
  static const Color surfaceTertiary = bgSurface3;

  static const Color textDisabled = textFaint;
}
