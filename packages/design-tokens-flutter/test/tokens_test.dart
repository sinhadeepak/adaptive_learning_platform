import 'package:flutter_test/flutter_test.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';

void main() {
  test('spacing scale uses the 4px base grid', () {
    expect(AlpSpacing.s1, 4);
    expect(AlpSpacing.s2, 8);
    expect(AlpSpacing.s4, 16);
    expect(AlpSpacing.s8, 32);
  });

  test('brand primary hex matches web token placeholder', () {
    expect(AlpColors.brandPrimary.toARGB32(), 0xFF2563EB);
  });

  test('density row heights are monotonic', () {
    expect(
      AlpDensityTokens.rowHeight(AlpDensity.compact) <
          AlpDensityTokens.rowHeight(AlpDensity.regular),
      isTrue,
    );
    expect(
      AlpDensityTokens.rowHeight(AlpDensity.regular) <
          AlpDensityTokens.rowHeight(AlpDensity.comfortable),
      isTrue,
    );
  });
}
