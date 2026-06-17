// PhotoDoubt — snap-a-doubt camera shell.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.4
//
// This is the *shell* — image pick + preview + send. The actual camera
// is handled by `image_picker` (already in pubspec). The widget keeps
// no business logic about uploads or OCR — it raises `onSubmit(file)`
// with the picked image and lets the caller wire the upload.
//
// States:
//   - empty   → instructions + "Snap doubt" + "From gallery" buttons
//   - preview → image + caption field + "Send" CTA + retake / cancel

import 'dart:io';

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import 'aurora_button.dart';
import 'aurora_card.dart';

class PhotoDoubt extends StatefulWidget {
  const PhotoDoubt({
    super.key,
    required this.onPickFromCamera,
    required this.onPickFromGallery,
    required this.onSubmit,
    this.maxImageHeight = 240,
  });

  /// Returns the picked file path or null if user cancelled. We avoid
  /// taking an `image_picker` dependency in the design-system layer
  /// and let the caller wrap whichever picker they use.
  final Future<String?> Function() onPickFromCamera;
  final Future<String?> Function() onPickFromGallery;

  /// Called when the student taps Send. Passes the image path and the
  /// caption text (may be empty).
  final Future<void> Function(String imagePath, String caption) onSubmit;

  final double maxImageHeight;

  @override
  State<PhotoDoubt> createState() => _PhotoDoubtState();
}

class _PhotoDoubtState extends State<PhotoDoubt> {
  String? _imagePath;
  final _captionCtrl = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _captionCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return _imagePath == null ? _empty() : _preview();
  }

  Widget _empty() {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;

    return AuroraCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Icon(Icons.camera_alt_outlined,
                  size: 18, color: colors.aurora500,),
              SizedBox(width: 6 * density.spaceScale),
              Text(
                'Snap a doubt',
                style: typography.h4
                    .copyWith(color: colors.neutral900),
              ),
            ],
          ),
          SizedBox(height: 6 * density.spaceScale),
          Text(
            "Photograph the question — we'll OCR the text and route it to a tutor or AI.",
            style: typography.bodySm
                .copyWith(color: colors.neutral600, height: 1.4),
          ),
          SizedBox(height: 12 * density.spaceScale),
          Row(
            children: [
              Expanded(
                child: AuroraButton(
                  label: 'Use camera',
                  iconLeft: const Icon(Icons.camera_alt, size: 16),
                  onPressed: _onPickFromCamera,
                  variant: AuroraButtonVariant.primary,
                  size: AuroraButtonSize.md,
                ),
              ),
              SizedBox(width: 8 * density.spaceScale),
              Expanded(
                child: AuroraButton(
                  label: 'From gallery',
                  iconLeft: const Icon(Icons.photo_library_outlined, size: 16),
                  onPressed: _onPickFromGallery,
                  variant: AuroraButtonVariant.secondary,
                  size: AuroraButtonSize.md,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _preview() {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;
    final radius = Theme.of(context).extension<AuroraRadius>()!;

    return AuroraCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          ClipRRect(
            borderRadius:
                BorderRadius.circular(radius.md * density.radiusScale),
            child: ConstrainedBox(
              constraints: BoxConstraints(maxHeight: widget.maxImageHeight),
              child: Image.file(File(_imagePath!), fit: BoxFit.cover),
            ),
          ),
          SizedBox(height: 8 * density.spaceScale),
          TextField(
            controller: _captionCtrl,
            minLines: 1,
            maxLines: 3,
            decoration: InputDecoration(
              hintText: 'Add context (optional) — e.g. step 3 confuses me',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(color: colors.neutral200),
              ),
            ),
            style: typography.body.copyWith(color: colors.neutral900),
          ),
          SizedBox(height: 12 * density.spaceScale),
          Row(
            children: [
              AuroraButton(
                label: 'Retake',
                variant: AuroraButtonVariant.ghost,
                size: AuroraButtonSize.sm,
                iconLeft: const Icon(Icons.refresh, size: 14),
                onPressed: _submitting ? null : _retake,
              ),
              const Spacer(),
              AuroraButton(
                label: _submitting ? 'Sending…' : 'Send',
                variant: AuroraButtonVariant.aurora,
                size: AuroraButtonSize.md,
                loading: _submitting,
                iconRight: const Icon(Icons.send, size: 14),
                onPressed: _submitting ? null : _onSubmit,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _onPickFromCamera() async {
    final path = await widget.onPickFromCamera();
    if (mounted && path != null) setState(() => _imagePath = path);
  }

  Future<void> _onPickFromGallery() async {
    final path = await widget.onPickFromGallery();
    if (mounted && path != null) setState(() => _imagePath = path);
  }

  void _retake() {
    setState(() {
      _imagePath = null;
      _captionCtrl.clear();
    });
  }

  Future<void> _onSubmit() async {
    if (_imagePath == null) return;
    setState(() => _submitting = true);
    try {
      await widget.onSubmit(_imagePath!, _captionCtrl.text.trim());
      if (mounted) _retake();
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}
