import 'package:flutter/material.dart';
import '../tokens.dart';

enum VidyaButtonStyle { primary, secondary, ghost }

enum VidyaButtonSize { sm, md, lg }

class VidyaButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final VidyaButtonStyle style;
  final VidyaButtonSize size;
  final IconData? leadingIcon;
  final IconData? trailingIcon;
  final bool loading;
  final bool disabled;
  final bool fullWidth;

  const VidyaButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.style = VidyaButtonStyle.primary,
    this.size = VidyaButtonSize.md,
    this.leadingIcon,
    this.trailingIcon,
    this.loading = false,
    this.disabled = false,
    this.fullWidth = false,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final isEnabled = !disabled && !loading && onPressed != null;

    final (bg, fg, border) = switch (style) {
      VidyaButtonStyle.primary => (v.accent, v.paper, null),
      VidyaButtonStyle.secondary => (v.accentSoft, v.accent, null),
      VidyaButtonStyle.ghost => (Colors.transparent, v.accent, v.rule2),
    };

    final (h, padH, fontSize) = switch (size) {
      VidyaButtonSize.sm => (36.0, 14.0, 13.0),
      VidyaButtonSize.md => (v.density.touchTarget, 20.0, 14.5),
      VidyaButtonSize.lg => (v.density.touchTarget + 8, 24.0, 16.0),
    };

    final content = loading
        ? SizedBox(
            width: fontSize,
            height: fontSize,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              valueColor: AlwaysStoppedAnimation(fg),
            ),
          )
        : Row(
            mainAxisSize: fullWidth ? MainAxisSize.max : MainAxisSize.min,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (leadingIcon != null) ...[
                Icon(leadingIcon, size: fontSize + 2, color: fg),
                const SizedBox(width: 8),
              ],
              Text(
                label,
                style: TextStyle(
                  fontFamily: VidyaFonts.ui,
                  fontSize: fontSize,
                  fontWeight: FontWeight.w500,
                  color: fg,
                  height: 1.2,
                ),
              ),
              if (trailingIcon != null) ...[
                const SizedBox(width: 8),
                Icon(trailingIcon, size: fontSize + 2, color: fg),
              ],
            ],
          );

    return Opacity(
      opacity: isEnabled ? 1.0 : 0.55,
      child: Material(
        color: bg,
        borderRadius: const BorderRadius.all(VidyaRadius.md),
        child: InkWell(
          onTap: isEnabled ? onPressed : null,
          borderRadius: const BorderRadius.all(VidyaRadius.md),
          child: Container(
            height: h,
            padding: EdgeInsets.symmetric(horizontal: padH),
            decoration: border != null
                ? BoxDecoration(
                    border: Border.all(color: border),
                    borderRadius: const BorderRadius.all(VidyaRadius.md),
                  )
                : null,
            alignment: Alignment.center,
            child: content,
          ),
        ),
      ),
    );
  }
}
