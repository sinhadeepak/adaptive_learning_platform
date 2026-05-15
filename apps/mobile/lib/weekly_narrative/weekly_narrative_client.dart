// Weekly Narrative client (Phase 6 S53 mobile parity).
//
// Mirrors apps/web-student/src/lib/weekly-narrative.ts. Backed by the
// alp-learning narrative service from 420815a:
//   GET  /adaptive/weekly-narrative/current/{user_id}
//   POST /adaptive/weekly-narrative/generate
//
// Schema mirrors the strict JSON schema enforced server-side:
//   {improved, slipping, hidden_pattern, forecast, week_ahead}
// where week_ahead has actions[].

import 'dart:convert';

import '../auth/auth_client.dart';

class NarrativeSection {
  const NarrativeSection({required this.text, this.dataLink});

  factory NarrativeSection.fromJson(Map<String, dynamic> j) =>
      NarrativeSection(
        text: j['text'] as String? ?? '',
        dataLink: j['data_link'] as String?,
      );

  final String text;
  final String? dataLink;
}

class WeekAheadSection {
  const WeekAheadSection({
    required this.text,
    required this.actions,
    this.dataLink,
  });

  factory WeekAheadSection.fromJson(Map<String, dynamic> j) =>
      WeekAheadSection(
        text: j['text'] as String? ?? '',
        actions: ((j['actions'] as List?) ?? const [])
            .map((e) => e.toString())
            .toList(),
        dataLink: j['data_link'] as String?,
      );

  final String text;
  final List<String> actions;
  final String? dataLink;
}

class Narrative {
  const Narrative({
    required this.improved,
    required this.slipping,
    required this.hiddenPattern,
    required this.forecast,
    required this.weekAhead,
  });

  factory Narrative.fromJson(Map<String, dynamic> j) => Narrative(
        improved: NarrativeSection.fromJson(
            j['improved'] as Map<String, dynamic>? ?? const {},),
        slipping: NarrativeSection.fromJson(
            j['slipping'] as Map<String, dynamic>? ?? const {},),
        hiddenPattern: NarrativeSection.fromJson(
            j['hidden_pattern'] as Map<String, dynamic>? ?? const {},),
        forecast: NarrativeSection.fromJson(
            j['forecast'] as Map<String, dynamic>? ?? const {},),
        weekAhead: WeekAheadSection.fromJson(
            j['week_ahead'] as Map<String, dynamic>? ?? const {},),
      );

  final NarrativeSection improved;
  final NarrativeSection slipping;
  final NarrativeSection hiddenPattern;
  final NarrativeSection forecast;
  final WeekAheadSection weekAhead;
}

class NarrativeRecord {
  const NarrativeRecord({
    required this.id,
    required this.userId,
    required this.weekStart,
    required this.narrative,
    required this.source,
    required this.isDelta,
    this.model,
    this.deltaTrigger,
  });

  factory NarrativeRecord.fromJson(Map<String, dynamic> j) =>
      NarrativeRecord(
        id: j['id'] as String,
        userId: j['user_id'] as String,
        weekStart: j['week_start'] as String,
        narrative:
            Narrative.fromJson(j['narrative'] as Map<String, dynamic>),
        source: j['source'] as String? ?? 'heuristic',
        model: j['model'] as String?,
        isDelta: j['is_delta'] as bool? ?? false,
        deltaTrigger: j['delta_trigger'] as String?,
      );

  final String id;
  final String userId;
  final String weekStart;
  final Narrative narrative;
  final String source; // "ai" | "heuristic"
  final String? model;
  final bool isDelta;
  final String? deltaTrigger;
}

/// Discriminated current-week response: either we have a record or
/// the server reported "not generated yet".
sealed class CurrentWeeklyNarrative {
  const CurrentWeeklyNarrative();
}

class NarrativeFound extends CurrentWeeklyNarrative {
  const NarrativeFound(this.record);
  final NarrativeRecord record;
}

class NarrativeAbsent extends CurrentWeeklyNarrative {
  const NarrativeAbsent(this.reason);
  final String reason;
}

class WeeklyNarrativeClient {
  WeeklyNarrativeClient({required this.auth});

  final AuthClient auth;

  Future<CurrentWeeklyNarrative> fetchCurrent(String userId) async {
    final r =
        await auth.apiGet('/adaptive/weekly-narrative/current/$userId');
    if (r.statusCode != 200) {
      throw Exception(
          'weekly narrative fetch failed: HTTP ${r.statusCode}',);
    }
    final body = jsonDecode(r.body) as Map<String, dynamic>;
    if (body['narrative'] == null) {
      return NarrativeAbsent(
        body['reason'] as String? ?? 'not_generated_yet',
      );
    }
    return NarrativeFound(NarrativeRecord.fromJson(body));
  }

  Future<NarrativeRecord> generate(String userId) async {
    final r = await auth.apiPost(
      '/adaptive/weekly-narrative/generate',
      {'user_id': userId},
    );
    if (r.statusCode != 200) {
      throw Exception(
          'weekly narrative generate failed: HTTP ${r.statusCode}',);
    }
    return NarrativeRecord.fromJson(
      jsonDecode(r.body) as Map<String, dynamic>,
    );
  }
}

// ─── data_link drill-down ───────────────────────────────────────────

class ParsedDataLink {
  const ParsedDataLink({
    required this.source,
    required this.label,
    this.key,
    this.value,
  });

  final String source;
  final String? key;
  final String? value;
  final String label;
}

const _sourceLabels = <String, String>{
  'concept_mastery_delta': 'See concept profile',
  'topic_decay': 'See syllabus coverage',
  'error_pattern': 'Open the error pattern report',
  'weak_concept': 'See weak concepts',
  'readiness': 'See readiness band',
  'time_distribution': 'Open insights',
  'fluency': 'See fluency',
  'calibration': 'See calibration',
};

ParsedDataLink? parseDataLink(String? raw) {
  if (raw == null) return null;
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return null;
  final firstColon = trimmed.indexOf(':');
  final source = firstColon == -1 ? trimmed : trimmed.substring(0, firstColon);
  final rest =
      firstColon == -1 ? '' : trimmed.substring(firstColon + 1);
  String? key;
  String? value;
  if (rest.isNotEmpty) {
    final c2 = rest.indexOf(':');
    if (c2 == -1) {
      key = rest;
    } else {
      key = rest.substring(0, c2);
      value = rest.substring(c2 + 1);
    }
  }
  return ParsedDataLink(
    source: source,
    key: key,
    value: value,
    label: _sourceLabels[source] ?? 'Open insights',
  );
}

// ─── Display helpers ────────────────────────────────────────────────

String formatWeekRange(String weekStart) {
  try {
    final start = DateTime.parse(weekStart);
    final end = start.add(const Duration(days: 6));
    String fmt(DateTime d) {
      const months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
      ];
      return '${months[d.month - 1]} ${d.day}';
    }
    return '${fmt(start)} – ${fmt(end)}';
  } catch (_) {
    return weekStart;
  }
}
