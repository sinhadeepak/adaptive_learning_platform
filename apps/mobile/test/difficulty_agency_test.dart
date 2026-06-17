// Tests for difficulty-agency client (P6 S54 mobile).

import 'dart:convert';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';
import 'package:adaptive_learning_mobile/difficulty_agency/difficulty_agency_client.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  group('wire mapping', () {
    test('intentAnchorWireValue maps each anchor', () {
      expect(intentAnchorWireValue(IntentAnchor.match), 'match');
      expect(intentAnchorWireValue(IntentAnchor.push), 'push');
      expect(intentAnchorWireValue(IntentAnchor.buildConfidence),
          'build_confidence',);
    });

    test('intentAnchorFromWire maps wire strings + falls back', () {
      expect(intentAnchorFromWire('push'), IntentAnchor.push);
      expect(intentAnchorFromWire('build_confidence'),
          IntentAnchor.buildConfidence,);
      expect(intentAnchorFromWire('match'), IntentAnchor.match);
      expect(intentAnchorFromWire('garbage'), IntentAnchor.match);
    });

    test('calibrationWireValue maps each bucket', () {
      expect(calibrationWireValue(CalibrationFeedback.tooEasy),
          'too_easy',);
      expect(calibrationWireValue(CalibrationFeedback.right), 'right');
      expect(calibrationWireValue(CalibrationFeedback.tooHard),
          'too_hard',);
    });

    test('frictionReasonLabel maps every reason', () {
      expect(frictionReasonLabel(FrictionReason.repeatedWrong),
          'Three wrong in a row',);
      expect(frictionReasonLabel(FrictionReason.fastCorrect),
          'Cruising through',);
      expect(frictionReasonLabel(FrictionReason.longHesitation),
          'Long hesitation',);
      expect(frictionReasonLabel(FrictionReason.repeatedSkip),
          'Two skips in a row',);
    });
  });

  group('checkFriction', () {
    test('returns null when server says no trigger', () async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        storage: const FlutterSecureStorage(),
        httpClient: MockClient((req) async => http.Response(
              jsonEncode({'trigger': null}),
              200,
              headers: {'content-type': 'application/json'},
            ),),
      );
      final out = await DifficultyAgencyClient(auth: auth)
          .checkFriction(const [], null);
      expect(out, isNull);
    });

    test('maps a populated trigger', () async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        storage: const FlutterSecureStorage(),
        httpClient: MockClient((req) async => http.Response(
              jsonEncode({
                'trigger': {
                  'reason': 'repeated_wrong',
                  'suggested_offset': -0.2,
                  'suggested_action': 'easier',
                  'message': 'The last 3 felt rough.',
                },
              }),
              200,
              headers: {'content-type': 'application/json'},
            ),),
      );
      final out = await DifficultyAgencyClient(auth: auth).checkFriction(
        const [
          FrictionItemAttempt(itemIdx: 0, isCorrect: false, timeSpentMs: 5000),
        ],
        null,
      );
      expect(out, isNotNull);
      expect(out!.reason, FrictionReason.repeatedWrong);
      expect(out.suggestedOffset, -0.2);
      expect(out.suggestedAction, FrictionAction.easier);
    });
  });

  group('previewIntentOffset', () {
    test('maps the response', () async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        storage: const FlutterSecureStorage(),
        httpClient: MockClient((req) async => http.Response(
              jsonEncode({
                'intent_anchor': 'push',
                'offset': 0.4,
                'effective_theta': 0.7,
              }),
              200,
              headers: {'content-type': 'application/json'},
            ),),
      );
      final out = await DifficultyAgencyClient(auth: auth)
          .previewIntentOffset(IntentAnchor.push, thetaHat: 0.3);
      expect(out.intentAnchor, IntentAnchor.push);
      expect(out.offset, 0.4);
      expect(out.effectiveTheta, 0.7);
    });
  });

  group('patchCalibration', () {
    test('non-200 throws', () async {
      final auth = AuthClient(
        baseUrl: 'http://test',
        storage: const FlutterSecureStorage(),
        httpClient: MockClient(
            (req) async => http.Response('boom', 422),),
      );
      expect(
        () => DifficultyAgencyClient(auth: auth)
            .patchCalibration('sid-1', CalibrationFeedback.right),
        throwsA(isA<Exception>()),
      );
    });
  });
}
