/// Lightweight i18n shell for Phase 5 mobile (P5-S67).
///
/// Flutter's `intl` tooling adds a build step + `.arb` files; for the
/// 30-odd Phase 5 strings this catalog is overkill. This map-based
/// shell hits the same surface (locale lookup + fallback) without the
/// codegen.
///
/// Hindi at v1 per AIM. Tamil/Telugu/Bengali/Marathi land alongside
/// the content team's per-language translation backfill.
library;

const Map<String, Map<String, String>> _strings = {
  'en': {
    'concept_profile.title': 'Concept profile',
    'concept_profile.subtitle': '9-dimension assessment substrate',
    'concept_profile.no_data': 'No concept-grain data yet. Take a quiz first — your profile populates as you submit responses.',
    'concept_profile.your_concepts': 'Your concepts',
    'concept_profile.bloom_matrix': 'Bloom matrix',
    'concept_profile.dim.mastery': 'Mastery',
    'concept_profile.dim.bloom': 'Bloom depth',
    'concept_profile.dim.fluency': 'Fluency',
    'concept_profile.dim.calibration': 'Calibration',
    'concept_profile.dim.transfer': 'Transfer',
    'diagnostic.title': 'Diagnostic deep dive',
    'diagnostic.subtitle': 'Find the deepest weak prereq',
    'diagnostic.headline_drill': 'Drill this first',
    'diagnostic.headline_no_gap': 'No deeper weak prereq found',
    'diagnostic.no_gap_explainer': 'Your prereq chain is solid. The wrong answer reflects a slip on the question itself, not a gap.',
    'diagnostic.path': 'Path',
    'diagnostic.run_button': 'Walk prereq chain',
    'quiz.confidence.label': 'How sure are you?',
    'quiz.confidence.guessing': 'Guessing',
    'quiz.confidence.maybe': 'Maybe',
    'quiz.confidence.pretty_sure': 'Pretty sure',
    'quiz.confidence.certain': 'Certain',
    'quiz.confidence.optional': '(optional)',
    'quiz.submit': 'Submit',
    'quiz.next': 'Next',
    'quiz.unattempted_warning': 'You haven\'t answered this question yet.',
    'common.loading': 'Loading…',
    'common.error': 'Something went wrong',
    'common.retry': 'Retry',
    'common.cancel': 'Cancel',
  },
  'hi': {
    'concept_profile.title': 'अवधारणा प्रोफ़ाइल',
    'concept_profile.subtitle': '9-आयामी मूल्यांकन सब्सट्रेट',
    'concept_profile.no_data': 'अभी तक कोई अवधारणा-स्तर डेटा नहीं। पहले एक क्विज़ लें — आपकी प्रोफ़ाइल जवाब जमा करते ही भर जाएगी।',
    'concept_profile.your_concepts': 'आपकी अवधारणाएँ',
    'concept_profile.bloom_matrix': 'ब्लूम मैट्रिक्स',
    'concept_profile.dim.mastery': 'महारत',
    'concept_profile.dim.bloom': 'ब्लूम-गहराई',
    'concept_profile.dim.fluency': 'धारा-प्रवाह',
    'concept_profile.dim.calibration': 'अंशशोधन',
    'concept_profile.dim.transfer': 'स्थानांतरण',
    'diagnostic.title': 'निदान गहन अध्ययन',
    'diagnostic.subtitle': 'सबसे गहरी कमज़ोर पूर्व-शर्त खोजें',
    'diagnostic.headline_drill': 'पहले इसे अभ्यास करें',
    'diagnostic.headline_no_gap': 'कोई गहरी कमज़ोर पूर्व-शर्त नहीं मिली',
    'diagnostic.no_gap_explainer': 'आपकी पूर्व-शर्त श्रृंखला मज़बूत है। गलत जवाब एक चूक है, कमी नहीं।',
    'diagnostic.path': 'पथ',
    'diagnostic.run_button': 'पूर्व-शर्त श्रृंखला चलाएँ',
    'quiz.confidence.label': 'आप कितने आश्वस्त हैं?',
    'quiz.confidence.guessing': 'अनुमान',
    'quiz.confidence.maybe': 'शायद',
    'quiz.confidence.pretty_sure': 'काफ़ी आश्वस्त',
    'quiz.confidence.certain': 'पक्का',
    'quiz.confidence.optional': '(वैकल्पिक)',
    'quiz.submit': 'जमा करें',
    'quiz.next': 'अगला',
    'quiz.unattempted_warning': 'आपने अभी तक यह सवाल नहीं किया है।',
    'common.loading': 'लोड हो रहा है…',
    'common.error': 'कुछ गड़बड़ हुई',
    'common.retry': 'पुनः प्रयास',
    'common.cancel': 'रद्द करें',
  },
};

/// Active locale — defaults to `en`. The Settings screen toggles this
/// through `setLocale`.
String _current = 'en';

void setLocale(String locale) {
  if (_strings.containsKey(locale)) {
    _current = locale;
  }
}

String currentLocale() => _current;

/// Lookup with English fallback. Missing keys return the key itself
/// so they're visible in the UI for translator review.
String t(String key) {
  final loc = _strings[_current];
  if (loc != null && loc.containsKey(key)) return loc[key]!;
  final en = _strings['en'];
  if (en != null && en.containsKey(key)) return en[key]!;
  return key;
}

// Screens use the top-level `t('key')` directly. A BuildContext-bound
// variant lands when this catalog grows enough to warrant Flutter's
// Localizations delegate; for v1 the ~30 keys per language don't need
// the ceremony.
