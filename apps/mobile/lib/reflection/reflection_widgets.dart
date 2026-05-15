// Reflection + recovery + low-bandwidth widgets (P6 S57 mobile).
//
// Mirrors:
//   apps/web-student/src/components/ReflectionSheet.tsx
//   apps/web-student/src/components/RecoveryBanner.tsx
//   apps/web-student/src/components/LowBandwidthToggle.tsx

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../aurora/widgets/widgets.dart';
import 'reflection_client.dart';

// ── ReflectionSheet ─────────────────────────────────────────────────

class ReflectionSheet extends StatefulWidget {
  const ReflectionSheet({
    super.key,
    required this.trigger,
    required this.onSubmit,
    required this.onClose,
    this.triggerArtifactId,
  });

  final ReflectionTrigger trigger;
  final String? triggerArtifactId;
  final void Function() onClose;
  final Future<void> Function({
    required String response,
    required String? commitment,
    required String? commitmentDueAt,
  }) onSubmit;

  @override
  State<ReflectionSheet> createState() => _ReflectionSheetState();
}

enum _Stage { reflect, commit }

class _ReflectionSheetState extends State<ReflectionSheet> {
  _Stage _stage = _Stage.reflect;
  final _responseCtrl = TextEditingController();
  final _commitmentCtrl = TextEditingController();
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _responseCtrl.dispose();
    _commitmentCtrl.dispose();
    super.dispose();
  }

  String get _eyebrow => switch (widget.trigger) {
        ReflectionTrigger.session => 'Reflect — practice session',
        ReflectionTrigger.mock => 'Reflect — mock test',
        ReflectionTrigger.weekly => 'Reflect — your week',
      };

  String get _prompt => switch (widget.trigger) {
        ReflectionTrigger.session =>
          'One thing that worked, one thing that tripped you up.',
        ReflectionTrigger.mock =>
          'Where did time pressure bite, where did you feel in flow?',
        ReflectionTrigger.weekly =>
          'The one signal from this week that should change next week.',
      };

  Future<void> _submit() async {
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await widget.onSubmit(
        response: _responseCtrl.text.trim(),
        commitment: _commitmentCtrl.text.trim().isEmpty
            ? null
            : _commitmentCtrl.text.trim(),
        commitmentDueAt: null,
      );
      widget.onClose();
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    return AuroraCard(
      tone: AuroraCardTone.auroraAi,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('◈ $_eyebrow',
              style: typography.overline.copyWith(
                color: colors.aurora500,
                letterSpacing: 0.5,
              ),),
          const SizedBox(height: 6),
          if (_stage == _Stage.reflect) ...[
            Text(_prompt,
                style: typography.h4
                    .copyWith(color: colors.neutral900),),
            const SizedBox(height: 8),
            TextField(
              controller: _responseCtrl,
              maxLines: 4,
              maxLength: 2000,
              decoration: InputDecoration(
                hintText: 'Two sentences. Honest beats polished.',
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: AuroraButton(
                    label: 'Skip',
                    variant: AuroraButtonVariant.secondary,
                    size: AuroraButtonSize.sm,
                    onPressed: widget.onClose,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: AuroraButton(
                    label: 'Next · commit →',
                    variant: AuroraButtonVariant.aurora,
                    size: AuroraButtonSize.sm,
                    onPressed: _responseCtrl.text.trim().isEmpty
                        ? null
                        : () => setState(() => _stage = _Stage.commit),
                  ),
                ),
              ],
            ),
          ] else ...[
            Text("One thing you'll actually do",
                style: typography.h4
                    .copyWith(color: colors.neutral900),),
            const SizedBox(height: 4),
            Text('Short, imperative, time-boxed.',
                style: typography.bodySm
                    .copyWith(color: colors.neutral600),),
            const SizedBox(height: 8),
            TextField(
              controller: _commitmentCtrl,
              maxLength: 400,
              decoration: InputDecoration(
                hintText:
                    'e.g. Drill Newton 3 for 20 minutes tomorrow',
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 4),
              Text(_error!,
                  style: typography.bodySm
                      .copyWith(color: colors.danger600),),
            ],
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: AuroraButton(
                    label: '← Back',
                    variant: AuroraButtonVariant.secondary,
                    size: AuroraButtonSize.sm,
                    onPressed: _submitting
                        ? null
                        : () => setState(() => _stage = _Stage.reflect),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: AuroraButton(
                    label: _submitting ? 'Saving…' : 'Save commitment',
                    variant: AuroraButtonVariant.aurora,
                    size: AuroraButtonSize.sm,
                    loading: _submitting,
                    onPressed: _submitting ? null : _submit,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

// ── RecoveryBanner ──────────────────────────────────────────────────

class RecoveryBanner extends StatefulWidget {
  const RecoveryBanner({super.key, required this.client});
  final RecoveryClient client;

  @override
  State<RecoveryBanner> createState() => _RecoveryBannerState();
}

class _RecoveryBannerState extends State<RecoveryBanner> {
  RecoveryProposal? _proposal;
  bool _hidden = false;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await widget.client.fetchActive();
      if (!mounted) return;
      if (res is RecoveryFound) setState(() => _proposal = res.proposal);
    } catch (_) {
      /* swallow — banner is a soft surface */
    }
  }

  Future<void> _accept() async {
    if (_proposal == null || _busy) return;
    setState(() => _busy = true);
    try {
      await widget.client.accept(_proposal!.id);
      if (mounted) setState(() => _hidden = true);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _decline() async {
    if (_proposal == null || _busy) return;
    setState(() => _busy = true);
    try {
      await widget.client.decline(_proposal!.id);
      if (mounted) setState(() => _hidden = true);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_hidden || _proposal == null) return const SizedBox.shrink();
    final p = _proposal!;
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final missed = p.missedSessionIds.length;
    return AuroraCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('↻',
                  style: typography.h3
                      .copyWith(color: colors.developing600),),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('RECOVERY MODE',
                        style: typography.overline.copyWith(
                          color: colors.developing600,
                          letterSpacing: 0.5,
                        ),),
                    Text(
                      '$missed planned session${missed == 1 ? '' : 's'} missed — here\'s a catch-up',
                      style: typography.h4
                          .copyWith(color: colors.neutral900),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(p.rationale,
              style: typography.bodySm
                  .copyWith(color: colors.neutral700, height: 1.5),),
          const SizedBox(height: 4),
          Text('~${p.expectedMinutes}m to catch up',
              style: typography.bodySm
                  .copyWith(color: colors.neutral600),),
          if (_error != null) ...[
            const SizedBox(height: 4),
            Text(_error!,
                style: typography.bodySm
                    .copyWith(color: colors.danger600),),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: AuroraButton(
                  label: 'Decline',
                  variant: AuroraButtonVariant.secondary,
                  size: AuroraButtonSize.sm,
                  onPressed: _busy ? null : _decline,
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: AuroraButton(
                  label: _busy ? 'Working…' : 'Accept catch-up →',
                  variant: AuroraButtonVariant.aurora,
                  size: AuroraButtonSize.sm,
                  onPressed: _busy ? null : _accept,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── LowBandwidthToggle ──────────────────────────────────────────────

class LowBandwidthToggle extends StatefulWidget {
  const LowBandwidthToggle({super.key});

  @override
  State<LowBandwidthToggle> createState() => _LowBandwidthToggleState();
}

class _LowBandwidthToggleState extends State<LowBandwidthToggle> {
  LowBandwidthPrefs _prefs = LowBandwidthPrefs.off;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final p = await loadLowBandwidthPrefs();
    if (mounted) setState(() => _prefs = p);
  }

  Future<void> _toggle(String key) async {
    LowBandwidthPrefs next;
    switch (key) {
      case 'animations':
        next = LowBandwidthPrefs(
          reducedAnimations: !_prefs.reducedAnimations,
          prefetchOff: _prefs.prefetchOff,
          imagesLite: _prefs.imagesLite,
        );
        break;
      case 'prefetch':
        next = LowBandwidthPrefs(
          reducedAnimations: _prefs.reducedAnimations,
          prefetchOff: !_prefs.prefetchOff,
          imagesLite: _prefs.imagesLite,
        );
        break;
      case 'images':
        next = LowBandwidthPrefs(
          reducedAnimations: _prefs.reducedAnimations,
          prefetchOff: _prefs.prefetchOff,
          imagesLite: !_prefs.imagesLite,
        );
        break;
      default:
        return;
    }
    setState(() => _prefs = next);
    await saveLowBandwidthPrefs(next);
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    return AuroraCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Low-bandwidth mode',
              style: typography.h4.copyWith(color: colors.neutral900),),
          const SizedBox(height: 4),
          Text(
            'On flaky or expensive cellular? Trim the visual weight + cut background prefetching.',
            style: typography.bodySm
                .copyWith(color: colors.neutral600, height: 1.5),
          ),
          const SizedBox(height: 12),
          _PrefRow(
            label: 'Reduce animations',
            help: 'Drop transitions + scrim fade-ins.',
            value: _prefs.reducedAnimations,
            onTap: () => _toggle('animations'),
          ),
          _PrefRow(
            label: 'Disable background prefetch',
            help: "Pages won't warm extra data behind the scenes.",
            value: _prefs.prefetchOff,
            onTap: () => _toggle('prefetch'),
          ),
          _PrefRow(
            label: 'Use lite images',
            help: 'Hero illustrations swap for lower-DPR variants.',
            value: _prefs.imagesLite,
            onTap: () => _toggle('images'),
          ),
        ],
      ),
    );
  }
}

class _PrefRow extends StatelessWidget {
  const _PrefRow({
    required this.label,
    required this.help,
    required this.value,
    required this.onTap,
  });

  final String label;
  final String help;
  final bool value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label,
                      style: typography.body.copyWith(
                        color: colors.neutral900,
                        fontWeight: FontWeight.w600,
                      ),),
                  Text(help,
                      style: typography.bodySm
                          .copyWith(color: colors.neutral600),),
                ],
              ),
            ),
            AuroraSwitch(value: value, onChanged: (_) => onTap()),
          ],
        ),
      ),
    );
  }
}
