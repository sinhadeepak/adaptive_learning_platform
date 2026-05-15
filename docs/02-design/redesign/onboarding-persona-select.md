# Redesign brief — Onboarding · "Who is this app for?"

**Part of:** [Design System v2 — "Aurora"](../design-system-v2-aurora-mobile.md) → Aurora v3 (Lumi-companion + persona system)
**Status:** Proposed
**Date:** 2026-05-14
**Wave / Sub-wave:** [Plan](../../../../.claude/plans/the-mobile-app-ui-cheerful-codd.md) Wave 2 W2.0
**Owner (TBD):** Design lead + Mobile lead

---

## 1. Goal

In one screen, capture the single piece of information that drives every other UI flex in the app — **which audience this install serves**. The Persona output of this screen drives:

- Primary navigation IA (4-tab Learner / 5-tab Teen / 5-tab Aspirant / Adventure Map Kid).
- Lumi voice, prominence, and coaching depth.
- Gamification intensity (streaks, leagues, battles, stars).
- Numeric exposure (raw percentile vs. stars).
- Parental layer (required Kid, optional Teen, none for Aspirant + Learner).
- Notification cadence and tone.
- Motion energy, illustration density, touch-target floors.
- Default density (Junior/Aspirant/Pro becomes a *secondary* preference within the chosen persona).

Without this screen, the app silently defaults every install to *Aspirant*, which is the right answer for ~30% of the addressable market and the wrong answer for the other 70%.

---

## 2. User / job-to-be-done

| Persona | The user is… | The job they're doing here |
|---|---|---|
| Kid (V–VIII) | A parent installing the app for their child (in 92% of cases, per BYJU's published research) | "Set this up safely for my 11-year-old; I'll be the gatekeeper for usage time and content" |
| Teen (IX–XII) | The student themselves, possibly with a parent watching | "Pick the option that matches my exam ambitions" |
| Aspirant (UPSC / CAT / GATE) | A 22–32-year-old preparing for a single high-stakes exam | "Tell the app I'm serious; don't give me a children's UI" |
| Learner (working professional) | An adult learner picking up a new skill | "I'm not preparing for an exam; show me courses" |

**One of the four** must be selected to proceed — there is no "Skip" or "Decide later" affordance. The choice is reversible from Settings.

---

## 3. Composition map

| Region | Components (Aurora widgets land in W2.1) |
|---|---|
| Top region (16% of viewport) | Compact Aurora wordmark + Lumi small orb idle-pulsing |
| Heading region (20%) | H1 "Who is this app for?" (`typography.h1`) · sub "We'll tailor the app — change any time in Settings." (`typography.bodyLg`, `neutral400`) |
| Choice region (50%) | 2×2 grid of `PersonaCard` tiles (atom, ships with W2.1 → for now built inline) |
| Footer region (14%) | `AuroraButton.primary` "Continue" (disabled until a tile is selected) + tiny `AuroraTextButton.tertiary` "Why are you asking?" (opens explainer sheet) |

Each `PersonaCard` is a 156×148 dp tile (Compact 320–600 dp viewport) with:
- 48 dp icon at top-center (illustrated per persona — see §4.1)
- 1-line bold label
- 2-line description in `typography.bodySm` / `neutral400`
- Selected state: `colors.brand600` 2 dp border + `colors.brand100` background tint + Lumi nudge animation
- Idle state: `colors.neutral200` 1 dp border + `colors.neutral0` background
- Touch target: 156×148 dp (well above 56 dp floor; entire tile is tappable)
- `Semantics(label: '<persona name>. <description>. <selected | not selected>')`

---

## 4. Wireframe (Compact 360×800 dp)

```
┌────────────────────────────────────────┐
│ ◉ ALP                            (16%) │   ← compact wordmark, Lumi pulses
├────────────────────────────────────────┤
│                                        │
│  Who is this app for?            (20%) │   ← H1, weight 700
│  We'll tailor the app — change         │
│  any time in Settings.                 │
│                                        │
├────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐      │
│  │  🎈         │  │  🎯         │      │
│  │  Kid        │  │  Teen       │      │
│  │  Class V-   │  │  IX-XII,    │      │
│  │  VIII (10-  │  │  NEET / JEE │ (50%)│
│  │  14)        │  │  prep       │      │
│  └─────────────┘  └─────────────┘      │
│  ┌─────────────┐  ┌─────────────┐      │
│  │  ⚖          │  │  💼         │      │
│  │  Aspirant   │  │  Learner    │      │
│  │  UPSC /CAT/ │  │  Working    │      │
│  │  GATE       │  │  pro skills │      │
│  └─────────────┘  └─────────────┘      │
├────────────────────────────────────────┤
│       ┌────────────────────────┐       │
│       │      Continue          │ (14%) │   ← disabled until tile picked
│       └────────────────────────┘       │
│           Why are you asking?          │
└────────────────────────────────────────┘
```

### 4.1 Persona-card icon system

Final icons land via the Wave 2 design pass (open question #1 in the plan). Wave 2 W2.0 mockup ships SVG placeholders:

| Persona | Placeholder symbol | Final design direction |
|---|---|---|
| Kid | 🎈 (balloon) | Cheerful kid figure with rocket / books backdrop, illustration density 3 |
| Teen | 🎯 (target) | Cool student silhouette with NEET / JEE / Boards icons orbiting |
| Aspirant | ⚖ (balance) | Composed adult silhouette with Constitution-of-India / Brief / Globe iconography |
| Learner | 💼 (briefcase) | Adult silhouette with laptop / certificate / skill-mosaic backdrop |

All icons use the Aurora gradient palette (cyan→violet) so the four tiles read as a single visual family.

---

## 5. States

| State | Visual |
|---|---|
| Idle (no tile selected) | Continue button `disabled` (50% opacity); helper-text below button: "Pick one to continue" |
| Hovered/pressed (any tile) | 4 dp `colors.brand500` ring + 1.02× scale + Lumi `lumiNudge` animation (200 ms) |
| Selected (one tile) | `brand600` 2 dp border + `brand100` tint + Continue enabled; other tiles dim to 0.85 opacity |
| Switching selection | 200 ms `colors.borderFade` between tiles; cancellable mid-press |
| Continue tapped | Tile expands 1.05×, Lumi `lumiCelebrate` particle burst (400 ms), navigator pushes Onboarding-Welcome (Lumi greeting) |
| Skip-not-allowed (Android back-button press) | Show `AlertDialog`: "We need this to set up your experience. Pick one of the four — you can change it any time." Confirm dismisses dialog (does NOT pop the screen) |

---

## 6. Motion (uses tokens from §7.6 of master spec)

| Element | Trigger | Token | Duration |
|---|---|---|---|
| Lumi pulse | Idle | `mFast` × persona-energy 1.20 | 2 s loop |
| Tile press | onTapDown | `mFast` `Curves.easeOutCubic` | 120 ms |
| Tile select transition | Selection change | `mBase` `Curves.elasticOut` | 280 ms |
| Continue button enable | First selection | `mBase` opacity 0.5 → 1.0 + scale 0.96 → 1.0 | 200 ms |
| Lumi celebrate on continue | Submit | `lumiCelebrate` | 400 ms before navigator push |
| Page push to next screen | After celebrate | `mPlatformPage` | 250 ms (iOS) / 200 ms (Android) |

---

## 7. Voice (locale: en-IN; HI/TA/TE/BN land W2.12/W3.8)

| Slot | Copy |
|---|---|
| H1 | "Who is this app for?" |
| Sub | "We'll tailor the app — change any time in Settings." |
| Kid tile label | "Kid · Class V–VIII (10–14)" |
| Kid tile desc | "Adventure-map learning, big illustrations, audio narration. Parent gate for safety." |
| Teen tile label | "Teen · Class IX–XII, NEET / JEE prep" |
| Teen tile desc | "Streaks, leagues, mock tests, doubt-solving with friends." |
| Aspirant tile label | "Aspirant · UPSC / CAT / GATE" |
| Aspirant tile desc | "Test series, sectional analysis, current affairs, mains evaluation." |
| Learner tile label | "Learner · Working professional skills" |
| Learner tile desc | "Bite-size lessons, certificates, learn at your pace." |
| CTA enabled | "Continue" |
| CTA helper (idle) | "Pick one to continue" |
| Why-explainer link | "Why are you asking?" |
| Why-explainer body | "We use this to choose the right experience. Different audiences want different homes, different gamification, and different parental controls. Pick the closest match — switch any time in Settings → Persona." |
| Back-prevent dialog | "We need this to set up your experience. Pick one of the four — you can change it any time." · "Got it" |

The `AuroraVoice` keys backing these strings are added in Wave 2 W2.0 (file `apps/mobile/lib/aurora/voice.dart`) so the screen reads from the voice library, not hard-coded strings.

---

## 8. Accessibility

- All four tiles are radio buttons under the hood (`Semantics(checked: bool, inMutuallyExclusiveGroup: true)`).
- Tile labels announced as: "<Persona name>. <Description>. <Selected | Not selected>".
- Continue button has a `Semantics(label: …, enabled: bool)` so screen-readers announce the disabled state with rationale.
- Dynamic-type cap: tiles allow up to 1.5× before content overflows; at 1.5×+ the layout collapses to 1-column 2-row.
- Color contrast: all text on tile background ≥ 4.5:1 (WCAG AA). Selected-state border is 2 dp brand-600 against `brand100` tint — verified.
- Keyboard support: Tab order is L→R top→bottom; Space / Enter selects; Tab past last tile lands on Continue.
- Reduce Motion: Lumi pulse + celebrate disabled; tiles still show selected-state styling.

---

## 9. Analytics events

All events carry the standard envelope from master spec §31 (userId hashed, persona, locale, deviceTier, networkQuality, sessionId, timestamp). Emitted from this screen:

| Event | Trigger | Props |
|---|---|---|
| `onboarding_persona_screen_viewed` | Screen mounts | `{viewed_from: "first_install" | "settings_reset" | "debug_preview"}` |
| `persona_card_tapped` | User taps a tile | `{persona: "kid|teen|aspirant|learner", time_since_view_ms: int}` |
| `persona_selection_changed` | User changes selection before continuing | `{from: "...", to: "..."}` |
| `persona_explainer_opened` | "Why are you asking?" tapped | `{}` |
| `persona_back_prevented` | Android back pressed | `{}` |
| `onboarding_persona_selected` | Continue tapped | `{persona: "...", time_to_select_ms: int, changes_before_commit: int}` |

The `time_to_select_ms` + `changes_before_commit` pair tells the team whether the screen is clear. If median `changes_before_commit > 1` we know the descriptions are unclear.

---

## 10. Edge cases & decisions

1. **What if onboarding is interrupted (app killed)?** Persona is persisted only on Continue tap. If the app is killed before that, the next launch returns to this same screen — no half-state.
2. **What if a user switches persona later in Settings?** Settings shows the same 4 tiles plus a warning: "Switching persona reorganises your home screen and changes some features. Your progress is preserved." On confirm we write the new persona; MaterialApp rebuilds.
3. **What if a Kid persona user is a 17-year-old?** Persona is a UX setting, not an age proof. The DPDP-compliant age verification flow (§29 of master spec) happens in a separate consent screen for users <18 regardless of persona choice.
4. **Multiple users on the same device?** Out of scope for Wave 2. Persona is per-install today. Family-plan W2.10 brief introduces per-member persona inside one install.
5. **Can a teacher / institution admin set the persona for a managed user?** Not from this screen. The bulk-import flow (W2.10 `corporate-seat.md`) lets admins pre-assign personas via CSV.

---

## 11. Out-of-scope (deferred to later W2 sub-waves)

- Final illustration of the four persona icons (open question #1).
- Lumi character art (open question #1).
- HI / TA / TE / BN translations (W2.12 / W3.8).
- Per-Kid sub-persona choice (e.g. "9–11 vs 12–14") — Wave 5 deepens.
- Per-Learner skill-category preselect on this screen — handled by Learner placement diagnostic (W6.1).

---

## 12. Dependencies

- `Persona` enum and `PersonaTheme` extension: shipped in W2.0 inside `packages/design-tokens-flutter/`.
- `PersonaNotifier` (persistence): shipped in W2.0 at `apps/mobile/lib/aurora/persona.dart`.
- `AuroraVoice` (microcopy library): shipped in W2.0 at `apps/mobile/lib/aurora/voice.dart` with `onboardingPersonaQ.*` keys.
- `AuroraButton`, `PersonaCard`: shipped in W2.1 component library. Wave 2 W2.0 mockup uses inline composition with raw Material widgets so the screen renders today.

---

## 13. Verification checklist

Before marking this brief shipped:

- [ ] Flutter widget renders for all 4 personas across all 3 densities × 2 themes (light/dark). Goldens land with W2.1.
- [ ] `PersonaNotifier.setPersona(...)` is called exactly once on Continue tap.
- [ ] `onboarding_persona_selected` event fires with correct props.
- [ ] Hot-reloading the screen with `kDebugMode` + `PersonaNotifier.resetForOnboarding()` returns to idle state.
- [ ] Screen-reader walkthrough on TalkBack (Android) + VoiceOver (iOS) reads tile state correctly.
- [ ] Selecting Kid → Continue routes to the Parent Unlock subflow (W2.6) instead of the standard Welcome → Exam → Language flow.
- [ ] Contrast verified at WCAG AA on light + dark themes.

---

## 14. Out-of-scope but referenced

- The Kid → Parent Unlock subflow is its own brief (`onboarding-parent-gate.md`, also in W2.2 catalog).
- The reasoning behind "no skip" is captured in the Brand Direction section of the master plan + master spec §4; not repeated here.
