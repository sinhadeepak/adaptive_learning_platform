// Models for the rich quiz-results explanation panel + video shelf.
//
// These mirror the web shapes:
//   • ExplainResult   ← POST /adaptive/explain   (ExplainCard's ExplainResponse)
//   • StudentResource ← GET  /content/resources  (ResourceShelf's StudentResource)
//
// The /adaptive/explain note is the v2.1.0 structured teaching note: a
// headline + key concept + why-correct + per-option verdicts + common
// pitfall + worked example + next steps. Older/heuristic responses may omit
// the rich fields and carry only `explanation`; all rich fields are nullable
// so both shapes parse.

class OptionVerdict {
  const OptionVerdict({
    required this.id,
    required this.isCorrect,
    required this.verdict,
  });

  final String id;
  final bool isCorrect;
  final String verdict;

  factory OptionVerdict.fromJson(Map<String, dynamic> j) => OptionVerdict(
        id: (j['id'] ?? '').toString(),
        isCorrect: j['is_correct'] == true,
        verdict: (j['verdict'] ?? '').toString(),
      );
}

class ExplainResult {
  const ExplainResult({
    this.headline,
    this.keyConcept,
    this.whyCorrect,
    this.options = const [],
    this.commonPitfall,
    this.workedExample,
    this.nextSteps = const [],
    this.explanation = '',
    this.source,
  });

  final String? headline;
  final String? keyConcept;
  final String? whyCorrect;
  final List<OptionVerdict> options;
  final String? commonPitfall;
  final String? workedExample;
  final List<String> nextSteps;
  final String explanation; // v1 legacy / fallback prose
  final String? source; // "ai" | "heuristic"

  /// True when the rich v2 fields are present (headline + per-option
  /// verdicts). Heuristic responses fall back to [explanation].
  bool get isRich => headline != null && options.isNotEmpty;

  factory ExplainResult.fromJson(Map<String, dynamic> j) => ExplainResult(
        headline: j['headline'] as String?,
        keyConcept: j['key_concept'] as String?,
        whyCorrect: j['why_correct'] as String?,
        options: (j['options'] as List?)
                ?.cast<Map<String, dynamic>>()
                .map(OptionVerdict.fromJson)
                .toList() ??
            const [],
        commonPitfall: j['common_pitfall'] as String?,
        workedExample: j['worked_example'] as String?,
        nextSteps:
            (j['next_steps'] as List?)?.map((e) => e.toString()).toList() ??
                const [],
        explanation: (j['explanation'] ?? '').toString(),
        source: j['source'] as String?,
      );
}

class StudentResource {
  const StudentResource({
    required this.id,
    required this.url,
    required this.title,
    this.externalId,
    this.thumbnailUrl,
    this.channelName,
    this.durationSeconds,
    this.difficulty,
  });

  final String id;
  final String url;
  final String title;
  final String? externalId; // YouTube video id
  final String? thumbnailUrl;
  final String? channelName;
  final int? durationSeconds;
  final String? difficulty; // EASY | MEDIUM | HARD

  factory StudentResource.fromJson(Map<String, dynamic> j) => StudentResource(
        id: j['id'] as String,
        url: (j['url'] ?? '').toString(),
        title: (j['title'] ?? '').toString(),
        externalId: j['external_id'] as String?,
        thumbnailUrl: j['thumbnail_url'] as String?,
        channelName: j['channel_name'] as String?,
        durationSeconds: (j['duration_seconds'] as num?)?.toInt(),
        difficulty: j['difficulty'] as String?,
      );
}
