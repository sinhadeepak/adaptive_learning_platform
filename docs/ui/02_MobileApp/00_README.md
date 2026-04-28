# AdaptiveLearn — Mobile App UI Kit
**Version 1.0 · iOS + Android · April 2026 · CONFIDENTIAL**

## Platform Targets
| Platform | Language | Architecture | Min Version |
|----------|----------|--------------|-------------|
| iOS | Swift (native) | MVVM + Coordinator + Combine | iOS 15+ |
| Android | Kotlin (native) | MVVM + Hilt + Jetpack Compose | Android 12 (API 31) |

## File Index

### Shared design system (4 files)
| File | Description |
|------|-------------|
| `00_design-system.css` | Global tokens, reset, shared components (shared with Student Portal) |
| `00_mobile-tokens.css` | Mobile-specific tokens — phone frame, touch targets, nav heights, OTP, quiz components |
| `00_components.js` | Shared ALP.* component library (shared with Student Portal) |
| `00_README.md` | This file |

### Auth & Onboarding (15 screens)
| File | Screen |
|------|--------|
| `01_splash.html` | Splash screen — animated loader, AI engine init |
| `02_welcome.html` | Welcome — product pitch, 3 feature strips, CTAs |
| `03_onboarding-1-ai-adapts.html` | How 3PL IRT works — step by step |
| `04_onboarding-2-readiness.html` | Readiness score — EWA model with live score card |
| `05_onboarding-3-guided.html` | Guided learning — live AI recommendation preview |
| `06_exam-select.html` | Exam selection (onboarding step 4 of 4) |
| `07_guest-screening.html` | Guest test landing — exam chip selector, what-you-get |
| `08_live-quiz.html` | Interactive AI quiz — real 3PL IRT questions, AI bar |
| `09_quiz-results.html` | Test results — readiness ring, topic breakdown, premium tease |
| `10_register.html` | Registration — SSO + form, pw strength, exam chips |
| `11_email-verify.html` | Email verification — 6-box OTP, countdown, resend |
| `12_login.html` | Login — AI insight strip, SSO, email/pw, OTP strip |
| `13_otp-login.html` | OTP login — 6-box entry, animated cursor, expiry |
| `14_reset-password.html` | Reset password — email field, security note, OTP alt |
| `15_new-password.html` | New password — verified banner, strength bar, bcrypt note |

### Main App Screens (6 screens)
| File | Screen |
|------|--------|
| `16_home.html` | Home — readiness hero, AI reco, exam cards, study health |
| `17_study-map.html` | Study Map — subject tabs, topic rows, mock tests |
| `18_ai-practice.html` | AI Practice — mode select + live quiz + results (3 views) |
| `19_analysis.html` | My Analysis — chart, KPIs, subject bars, topic matrix |
| `20_more-leaderboard-experts.html` | More — Leaderboard + Expert Help drill-downs |
| `21_profile-settings.html` | Profile & Settings — all 7 sections with toggles |

## Mobile Design System

### Phone frame spec
```
Width:      375px (iPhone 14 / standard compact viewport)
Height:     812px (iPhone X/11/12/13 standard)
Status bar: 44px fixed
Bottom nav: 72px fixed
Content:    calc(812px - 44px - 72px) = 696px scrollable
Padding:    20px horizontal (--mobile-safe-side)
```

### Touch targets
```css
--touch-min:          44px;   /* iOS HIG minimum */
--touch-comfortable:  48px;   /* Material Design comfortable */
```
All interactive elements (buttons, nav items, topic rows, quiz options) meet the 44px minimum.

### Bottom navigation
5 items: Home · Study · Practice · Analysis · More (collapses Expert Help + Leaderboard)

```
Home      ⚡  — Master dashboard, exam cards, AI recommendation
Study     📚  — Study Map with topic list and mock tests
Practice  🎯  — AI Practice mode selector + live quiz
Analysis  📊  — Score trajectory, topic matrix, insights
More      ⋯   — Leaderboard, Expert Help, Settings, Assignments
```

### Key mobile-specific component classes (from 00_mobile-tokens.css)
```css
.phone-frame          /* 375×812 prototype container */
.mobile-status        /* Status bar 44px */
.mobile-bottom-nav    /* Bottom nav 72px */
.mobile-nav-item      /* Nav tab with 44px min touch */
.mobile-page-hd       /* Page header with back button */
.mobile-scroll        /* Scrollable content area */
.m-card               /* Standard content card */
.m-card-ai            /* AI-accented card (cyan border) */
.m-topic-row          /* Topic list row with 48px min height */
.m-sec-label          /* Section label with uppercase tracking */
.m-form-input         /* Mobile form input 48px min height */
.m-btn-full           /* Full-width button 48px */
.m-otp-box            /* 48×56px OTP digit box */
.m-pw-bar             /* Password strength bar segment */
.m-exam-chip          /* Onboarding exam selection card */
.m-social-btn         /* Google/Apple SSO button */
.m-ai-ctx-bar         /* AI context bar in quiz (θ, b, difficulty) */
.m-quiz-opt           /* Quiz answer option with correct/wrong states */
.m-quiz-key           /* A/B/C/D letter key in quiz option */
```

## AI Design Language (mobile)
Same as Student Portal — consistent across all surfaces:
- `◈` symbol marks every AI-powered feature
- `--color-ai: #22D4EE` (cyan) for all AI UI elements
- θ (theta) displayed as the user's ability estimate
- b-parameter shown in the AI context bar during quiz
- Readiness score ring uses the green→blue gradient

## iOS Implementation Notes
```swift
// JWT — Keychain only
KeychainWrapper.standard.set(accessToken, forKey: "alp_access_token")

// Navigation — Coordinator pattern
class StudyMapCoordinator: Coordinator {
  func showTopicPractice(topic: Topic) { ... }
}

// State — ObservableObject + @Published
class ReadinessViewModel: ObservableObject {
  @Published var score: Double = 0.0
  @Published var thetaEstimate: Double = 0.0
}

// Networking — URLSession + async/await
let result = try await networkClient.get("/analytics/summary")
```

## Android Implementation Notes
```kotlin
// JWT — EncryptedSharedPreferences
val prefs = EncryptedSharedPreferences.create(...)
prefs.edit().putString("alp_access_token", token).apply()

// DI — Hilt
@HiltViewModel
class StudyMapViewModel @Inject constructor(
    private val studyMapRepository: StudyMapRepository
) : ViewModel()

// UI — Jetpack Compose + Material 3
@Composable
fun ReadinessHeroCard(score: Float, prediction: Int) { ... }

// Navigation — Navigation Component
navController.navigate(Screen.TopicPractice.route)
```

---
*AdaptiveLearn Mobile · v1.0 · April 2026 · CONFIDENTIAL*
