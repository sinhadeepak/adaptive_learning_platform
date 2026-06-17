// Tests for S58 mobile polish helpers (bucketing + tag mapping).

import 'package:adaptive_learning_mobile/coaching/coaching_widgets.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('bucketFor', () {
    test('aligned when |delta| < 10%', () {
      expect(
        bucketFor(const CalibrationRow(
          key: 'a',
          confidence: 0.6,
          accuracy: 0.62,
          n: 5,
        ),),
        CalibrationBucket.aligned,
      );
    });

    test('overconfident when confidence > accuracy + 10%', () {
      expect(
        bucketFor(const CalibrationRow(
          key: 'b',
          confidence: 0.85,
          accuracy: 0.55,
          n: 5,
        ),),
        CalibrationBucket.overconfident,
      );
    });

    test('underconfident when confidence < accuracy - 10%', () {
      expect(
        bucketFor(const CalibrationRow(
          key: 'c',
          confidence: 0.35,
          accuracy: 0.75,
          n: 5,
        ),),
        CalibrationBucket.underconfident,
      );
    });
  });

  group('ErrorTag wire mapping', () {
    test('errorTagWire maps every tag', () {
      expect(errorTagWire(ErrorTag.sillyMistake), 'silly_mistake');
      expect(errorTagWire(ErrorTag.conceptualGap), 'conceptual_gap');
      expect(errorTagWire(ErrorTag.timePressure), 'time_pressure');
      expect(errorTagWire(ErrorTag.formulaError), 'formula_error');
      expect(errorTagWire(ErrorTag.signOrUnitError),
          'sign_or_unit_error',);
      expect(errorTagWire(ErrorTag.unattempted), 'unattempted');
    });

    test('errorTagFromWire round-trips + falls back to null', () {
      expect(errorTagFromWire('silly_mistake'), ErrorTag.sillyMistake);
      expect(errorTagFromWire('time_pressure'), ErrorTag.timePressure);
      expect(errorTagFromWire('unknown'), isNull);
    });

    test('errorTagLabel maps every tag', () {
      expect(errorTagLabel(ErrorTag.sillyMistake), 'Silly mistakes');
      expect(errorTagLabel(ErrorTag.conceptualGap), 'Conceptual gaps');
      expect(
          errorTagLabel(ErrorTag.timePressure), 'Time-pressure errors',);
      expect(errorTagLabel(ErrorTag.formulaError),
          'Formula misapplication',);
      expect(errorTagLabel(ErrorTag.signOrUnitError),
          'Sign / unit errors',);
      expect(errorTagLabel(ErrorTag.unattempted), 'Unattempted');
    });
  });
}
