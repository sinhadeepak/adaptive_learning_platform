import 'dart:convert';

import '../auth/auth_client.dart';

/// Phase 5 mobile API client (P5-S67).
///
/// Wraps the multi-parameter profile, diagnostic root-cause, and
/// per-family question type endpoints from S39 / S41 / S51. Mirrors
/// the typed clients in `apps/web-student/src/lib/phase5-api.ts`.
class Phase5Api {
  Phase5Api(this.auth);
  final AuthClient auth;

  // ── Multi-parameter profile ──────────────────────────────────────────────

  Future<MultiProfileResponse> multiProfile(String userId, {String? since}) async {
    final qs = since != null ? '?since=$since' : '';
    final r = await auth.apiGet('/analytics/student/$userId/multi-profile$qs');
    return MultiProfileResponse.fromJson(jsonDecode(r.body) as Map<String, dynamic>);
  }

  Future<List<TransferRow>> transfer(String userId, {int minN = 3}) async {
    final r = await auth.apiGet('/analytics/transfer/$userId?min_n_per_bucket=$minN');
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    final list = (j['transfer'] as List? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(TransferRow.fromJson)
        .toList();
    return list;
  }

  // ── Diagnostic root-cause ────────────────────────────────────────────────

  Future<RootCauseResponse> rootCause({
    required String primaryConceptId,
    required Map<String, double> userConceptMastery,
    required List<RootCauseEdge> edges,
    double weakThreshold = 0.4,
  }) async {
    final r = await auth.apiPost(
      '/adaptive/diagnostic/root-cause',
      jsonEncode({
        'primaryConceptId': primaryConceptId,
        'userConceptMastery': userConceptMastery,
        'edges': edges.map((e) => e.toJson()).toList(),
        'weakThreshold': weakThreshold,
      }),
    );
    return RootCauseResponse.fromJson(jsonDecode(r.body) as Map<String, dynamic>);
  }

  // ── Type registry ────────────────────────────────────────────────────────

  Future<List<TypeMeta>> listTypes() async {
    final r = await auth.apiGet('/content/types');
    final list = (jsonDecode(r.body) as List).cast<Map<String, dynamic>>();
    return list.map(TypeMeta.fromJson).toList();
  }
}

// ── Models ─────────────────────────────────────────────────────────────────

class ConceptMasteryRow {
  ConceptMasteryRow({required this.conceptId, required this.ewa, required this.n});
  final String conceptId;
  final double ewa;
  final int n;

  factory ConceptMasteryRow.fromJson(Map<String, dynamic> j) => ConceptMasteryRow(
        conceptId: j['conceptId'] as String,
        ewa: (j['ewa'] as num).toDouble(),
        n: (j['n'] as num).toInt(),
      );
}

class FluencyRow {
  FluencyRow({required this.conceptId, required this.fluencyScore, required this.n});
  final String conceptId;
  final double fluencyScore;
  final int n;

  factory FluencyRow.fromJson(Map<String, dynamic> j) => FluencyRow(
        conceptId: j['conceptId'] as String,
        fluencyScore: (j['fluencyScore'] as num).toDouble(),
        n: (j['n'] as num).toInt(),
      );
}

class MultiProfileResponse {
  MultiProfileResponse({
    required this.userId,
    required this.concepts,
    required this.bloomMatrix,
    required this.fluency,
    required this.confidenceBrier,
  });
  final String userId;
  final List<ConceptMasteryRow> concepts;
  final Map<String, Map<String, Map<String, dynamic>>> bloomMatrix;
  final List<FluencyRow> fluency;
  final double? confidenceBrier;

  factory MultiProfileResponse.fromJson(Map<String, dynamic> j) {
    final concepts = (j['concepts'] as List? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(ConceptMasteryRow.fromJson)
        .toList();
    final bm = <String, Map<String, Map<String, dynamic>>>{};
    final raw = j['bloomMatrix'] as Map<String, dynamic>? ?? const {};
    raw.forEach((k, v) {
      bm[k] = (v as Map<String, dynamic>).map(
        (level, m) => MapEntry(level, (m as Map<String, dynamic>)),
      );
    });
    final fluency = (j['fluency'] as List? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(FluencyRow.fromJson)
        .toList();
    return MultiProfileResponse(
      userId: j['userId'] as String,
      concepts: concepts,
      bloomMatrix: bm,
      fluency: fluency,
      confidenceBrier:
          j['confidenceBrier'] != null ? (j['confidenceBrier'] as num).toDouble() : null,
    );
  }
}

class TransferRow {
  TransferRow({
    required this.conceptId,
    required this.transferScore,
    required this.nSingleTag,
    required this.nMultiTag,
  });
  final String conceptId;
  final double? transferScore;
  final int nSingleTag;
  final int nMultiTag;

  factory TransferRow.fromJson(Map<String, dynamic> j) => TransferRow(
        conceptId: j['conceptId'] as String,
        transferScore:
            j['transferScore'] != null ? (j['transferScore'] as num).toDouble() : null,
        nSingleTag: (j['n_single_tag'] as num? ?? 0).toInt(),
        nMultiTag: (j['n_multi_tag'] as num? ?? 0).toInt(),
      );
}

class RootCauseEdge {
  RootCauseEdge({required this.fromConceptId, required this.toConceptId, this.weight});
  final String fromConceptId;
  final String toConceptId;
  final double? weight;

  Map<String, dynamic> toJson() => {
        'fromConceptId': fromConceptId,
        'toConceptId': toConceptId,
        if (weight != null) 'weight': weight,
      };
}

class RootCauseResponse {
  RootCauseResponse({
    required this.primaryConceptId,
    required this.rootCauseConceptId,
    required this.path,
    required this.weakConcepts,
    required this.notes,
  });
  final String primaryConceptId;
  final String? rootCauseConceptId;
  final List<String> path;
  final List<String> weakConcepts;
  final List<String> notes;

  factory RootCauseResponse.fromJson(Map<String, dynamic> j) => RootCauseResponse(
        primaryConceptId: j['primaryConceptId'] as String,
        rootCauseConceptId: j['rootCauseConceptId'] as String?,
        path: (j['path'] as List? ?? const []).cast<String>(),
        weakConcepts: (j['weakConcepts'] as List? ?? const []).cast<String>(),
        notes: (j['notes'] as List? ?? const []).cast<String>(),
      );
}

class TypeMeta {
  TypeMeta({
    required this.typeId,
    required this.family,
    required this.evaluationMode,
    required this.supportsPartial,
    required this.mediaKinds,
  });
  final String typeId;
  final String family;
  final String evaluationMode;
  final bool supportsPartial;
  final List<String> mediaKinds;

  factory TypeMeta.fromJson(Map<String, dynamic> j) => TypeMeta(
        typeId: j['type_id'] as String,
        family: j['family'] as String,
        evaluationMode: j['evaluation_mode'] as String,
        supportsPartial: j['supports_partial'] as bool? ?? false,
        mediaKinds: (j['media_kinds'] as List? ?? const []).cast<String>(),
      );
}
