enum AlpDensity { compact, regular, comfortable }

class AlpDensityTokens {
  AlpDensityTokens._();

  static double rowHeight(AlpDensity d) => switch (d) {
        AlpDensity.compact => 40,
        AlpDensity.regular => 48,
        AlpDensity.comfortable => 56,
      };

  static double fieldGap(AlpDensity d) => switch (d) {
        AlpDensity.compact => 8,
        AlpDensity.regular => 12,
        AlpDensity.comfortable => 16,
      };

  static double cardPadding(AlpDensity d) => switch (d) {
        AlpDensity.compact => 16,
        AlpDensity.regular => 20,
        AlpDensity.comfortable => 24,
      };
}
