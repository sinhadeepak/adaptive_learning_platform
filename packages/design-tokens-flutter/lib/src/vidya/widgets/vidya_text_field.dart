import 'package:flutter/material.dart';
import '../tokens.dart';

class VidyaTextField extends StatelessWidget {
  final String label;
  final String? hint;
  final String? helper;
  final String? error;
  final TextEditingController? controller;
  final ValueChanged<String>? onChanged;
  final IconData? prefixIcon;
  final IconData? suffixIcon;
  final VoidCallback? onSuffixTap;
  final bool obscure;
  final bool enabled;
  final TextInputType? keyboardType;
  final int? maxLines;

  const VidyaTextField({
    super.key,
    required this.label,
    this.hint,
    this.helper,
    this.error,
    this.controller,
    this.onChanged,
    this.prefixIcon,
    this.suffixIcon,
    this.onSuffixTap,
    this.obscure = false,
    this.enabled = true,
    this.keyboardType,
    this.maxLines = 1,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final hasError = error != null && error!.isNotEmpty;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label.toUpperCase(),
          style: VidyaText.overline(v.ink3),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          onChanged: onChanged,
          obscureText: obscure,
          enabled: enabled,
          keyboardType: keyboardType,
          maxLines: obscure ? 1 : maxLines,
          style: VidyaText.body(v.ink),
          decoration: InputDecoration(
            hintText: hint,
            hintStyle: VidyaText.body(v.ink4),
            filled: true,
            fillColor: v.paper2,
            prefixIcon: prefixIcon == null
                ? null
                : Icon(prefixIcon, color: v.ink3, size: 18),
            suffixIcon: suffixIcon == null
                ? null
                : IconButton(
                    icon: Icon(suffixIcon, color: v.ink3, size: 18),
                    onPressed: onSuffixTap,
                  ),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            border: OutlineInputBorder(
              borderRadius: const BorderRadius.all(VidyaRadius.md),
              borderSide: BorderSide(color: v.rule),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: const BorderRadius.all(VidyaRadius.md),
              borderSide: BorderSide(color: hasError ? v.bad : v.rule),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: const BorderRadius.all(VidyaRadius.md),
              borderSide:
                  BorderSide(color: hasError ? v.bad : v.accent, width: 1.5),
            ),
          ),
        ),
        if (hasError) ...[
          const SizedBox(height: 6),
          Text(error!, style: VidyaText.bodySm(v.bad)),
        ] else if (helper != null) ...[
          const SizedBox(height: 6),
          Text(helper!, style: VidyaText.bodySm(v.ink3)),
        ],
      ],
    );
  }
}
