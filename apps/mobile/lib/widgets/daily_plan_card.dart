// Daily Plan — Phase B3 (IGS) Flutter parity for the web DailyPlanCard.
//
// Lifecycle: on mount fetch /igs/today-plan, then open the WS stream
// and patch the top action whenever the server pushes a new
// `igs.next-action.updated`. The widget observes the app lifecycle so
// the WS connection is re-established when the user resumes the app
// from background (Android / iOS both kill long-idle sockets).

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../auth/auth_client.dart';
import '../igs/igs_client.dart';
import 'alp_card.dart';

const Map<String, String> _kindTitles = {
  'practice_concept': 'Practice — weak concept',
  'revise_concept': 'Revise — fading recall',
  'take_mock': 'Mock — full pattern',
  'watch_video': 'Watch — short explainer',
  'crash_drill': 'Crash drill — high-yield',
  'take_break': 'Take a short break',
};

class DailyPlanCard extends StatefulWidget {
  const DailyPlanCard({super.key, required this.auth, required this.examId});
  final AuthClient auth;
  final String examId;

  @override
  State<DailyPlanCard> createState() => _DailyPlanCardState();
}

class _DailyPlanCardState extends State<DailyPlanCard>
    with WidgetsBindingObserver {
  late final IGSClient _client = IGSClient(widget.auth);
  IGSStream? _stream;
  TodayPlan? _plan;
  String? _error;
  bool _updated = false;
  int? _openedIdx;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
    _openStream();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _stream?.close();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // Reconnect on resume — sockets often die in background.
      _stream?.close();
      _openStream();
      _load();
    }
  }

  Future<void> _load() async {
    final uid = widget.auth.user?.id;
    if (uid == null) return;
    try {
      final p = await _client.fetchTodayPlan(uid, widget.examId);
      if (!mounted) return;
      setState(() {
        _plan = p;
        _error = p == null ? 'No plan available' : null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    }
  }

  void _openStream() {
    _stream = IGSStream(
      auth: widget.auth,
      examId: widget.examId,
      onNextAction: (chosen) {
        if (!mounted || _plan == null || _plan!.actions.isEmpty) return;
        setState(() {
          _plan!.actions[0] = chosen;
        });
      },
      onPlanUpdated: () {
        if (!mounted) return;
        setState(() => _updated = true);
        _load();
      },
    )..connect();
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null && _plan == null) {
      return AlpCard(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Text(
            "Couldn't load today's plan: $_error",
            style: const TextStyle(fontSize: 13),
          ),
        ),
      );
    }
    if (_plan == null) {
      return const AlpCard(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: SizedBox(
            height: 80,
            child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
          ),
        ),
      );
    }
    final plan = _plan!;
    return AlpCard(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  "◈ TODAY'S PLAN",
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.6,
                    color: AlpColors.colorAi,
                  ),
                ),
                Text(
                  '${plan.totalMinutes} min · ${plan.actions.length} actions',
                  style: const TextStyle(fontSize: 11, color: AlpColors.textFaint),
                ),
              ],
            ),
            if (_updated)
              Padding(
                padding: const EdgeInsets.only(top: 10),
                child: Row(
                  children: [
                    const Expanded(
                      child: Text(
                        'Your plan just updated.',
                        style: TextStyle(fontSize: 12, color: AlpColors.textSecondary),
                      ),
                    ),
                    TextButton(
                      onPressed: () => setState(() => _updated = false),
                      child: const Text('Dismiss', style: TextStyle(fontSize: 12)),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 8),
            ...List.generate(plan.actions.length, (i) => _buildItem(plan.actions[i], i)),
          ],
        ),
      ),
    );
  }

  Widget _buildItem(IGSAction a, int i) {
    final title = _kindTitles[a.actionKind] ?? a.actionKind;
    final meta = StringBuffer('${a.expectedMinutes} min');
    if (a.questionCount != null) meta.write(' · ${a.questionCount} q');
    if (a.expectedMarksGained > 0) {
      meta.write(' · +${a.expectedMarksGained.toStringAsFixed(1)} marks');
    }
    final isOpen = _openedIdx == i;
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: i == 0
            ? AlpColors.bgSurface4.withOpacity(0.6)
            : Colors.transparent,
        borderRadius: BorderRadius.circular(6),
        border: Border(
          top: i == 0
              ? BorderSide.none
              : const BorderSide(color: AlpColors.bgSurface3),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: const TextStyle(
                            fontSize: 14, fontWeight: FontWeight.w600)),
                    Text(meta.toString(),
                        style: const TextStyle(
                            fontSize: 11, color: AlpColors.textFaint)),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  ElevatedButton(
                    onPressed: () => _start(a),
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    ),
                    child: const Text('Start →', style: TextStyle(fontSize: 12)),
                  ),
                  TextButton(
                    onPressed: () =>
                        setState(() => _openedIdx = isOpen ? null : i),
                    child: Text(isOpen ? 'Hide why' : 'Why this?',
                        style: const TextStyle(fontSize: 11)),
                  ),
                ],
              ),
            ],
          ),
          if (isOpen)
            Container(
              margin: const EdgeInsets.only(top: 8),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AlpColors.bgSurface4,
                borderRadius: BorderRadius.circular(4),
                border: const Border(
                  left: BorderSide(color: AlpColors.colorAi, width: 2),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (final r in a.rationale)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Text('• $r',
                          style: const TextStyle(
                              fontSize: 12, color: AlpColors.textSecondary)),
                    ),
                  TextButton(
                    onPressed: () => _skip(i),
                    child: const Text('Skip this action',
                        style: TextStyle(fontSize: 11, color: AlpColors.textFaint)),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  void _start(IGSAction a) {
    // The parent screen owns navigation; the daily-plan card surfaces
    // intent via a snackbar so we don't bake routing into a widget that
    // also lives on screens with different nav stacks. A future refactor
    // can wire this to an `onStart` callback if needed.
    final messenger = ScaffoldMessenger.maybeOf(context);
    messenger?.showSnackBar(SnackBar(
      content: Text('Starting: ${_kindTitles[a.actionKind] ?? a.actionKind}'),
      duration: const Duration(seconds: 2),
    ));
  }

  Future<void> _skip(int i) async {
    final uid = widget.auth.user?.id;
    if (uid == null) return;
    await _client.postOverride(
      uid,
      chosenActionKind: 'take_break',
      rejectedTopActionId: '$i',
      reason: 'user-skipped',
    );
    setState(() => _openedIdx = null);
    _load();
  }
}
