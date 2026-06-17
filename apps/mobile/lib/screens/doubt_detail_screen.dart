import 'package:alp_design_tokens/alp_design_tokens.dart';
import '../aurora/widgets/widgets.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../widgets/alp_card.dart';
import '../widgets/tutor_message.dart';

/// Read-only thread view: question + chronological answers (AI / expert / peer).
/// Tap an answer is a no-op for now; in a future pass students can vote / accept.
///
/// `autoAskAi: true` triggers the AI tutor stream on first load so callers
/// (e.g., quiz-review "Ask AI" shortcut) don't need a second tap.
class DoubtDetailScreen extends StatefulWidget {
  const DoubtDetailScreen({
    super.key,
    required this.api,
    required this.doubtId,
    this.autoAskAi = false,
  });
  final ApiClient api;
  final String doubtId;
  final bool autoAskAi;

  @override
  State<DoubtDetailScreen> createState() => _DoubtDetailScreenState();
}

class _DoubtDetailScreenState extends State<DoubtDetailScreen> {
  DoubtDetail? _detail;
  bool _loading = true;
  String? _error;
  final TextEditingController _replyCtrl = TextEditingController();
  bool _posting = false;
  bool _aiStreaming = false;
  String _aiBuffer = '';
  bool _aiAutoTriggered = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _replyCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final d = await widget.api.getDoubt(widget.doubtId);
      if (!mounted) return;
      if (d == null) {
        setState(() {
          _error = 'Doubt not found.';
          _loading = false;
        });
        return;
      }
      // Auto-trigger AI tutor if requested by the caller and the thread
      // doesn't already have an AI answer. Guarded by _aiAutoTriggered
      // so a refresh after the AI answer lands doesn't re-fire.
      final hasAi = d.answers.any((a) => a.source == 'ai');
      if (widget.autoAskAi && !_aiAutoTriggered && !hasAi) {
        _aiAutoTriggered = true;
        // Set state first so the UI knows we're streaming, then kick off
        // the request after the build (the streaming preview replaces the
        // missing AI answer placeholder).
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) _askAi();
        });
      }
      setState(() {
        _detail = d;
        _loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = '$e';
          _loading = false;
        });
      }
    }
  }

  Future<void> _askAi() async {
    if (_aiStreaming || _detail == null) return;
    setState(() {
      _aiStreaming = true;
      _aiBuffer = '';
    });
    final messages = buildTutorMessages(
      questionText: _detail!.summary.questionText,
      answers: _detail!.answers,
    );
    final stream = widget.api.tutorChat(
      topicId: _detail!.summary.topicId ?? '00000000-0000-0000-0000-000000000000',
      messages: messages,
    );
    var acc = '';
    try {
      await for (final delta in stream) {
        acc += delta;
        if (!mounted) return;
        setState(() => _aiBuffer = acc);
      }
      // Persist the streamed reply as an answer once complete.
      if (acc.trim().isNotEmpty) {
        await widget.api.postAnswer(widget.doubtId, acc.trim(), source: 'ai');
        await _load();
      }
    } catch (_) {/* swallow — UI stays in pre-stream state */} finally {
      if (mounted) {
        setState(() {
        _aiStreaming = false;
        _aiBuffer = '';
      });
      }
    }
  }

  Future<void> _postReply() async {
    final text = _replyCtrl.text.trim();
    if (text.isEmpty || _posting) return;
    setState(() => _posting = true);
    try {
      // source=peer; backend auto-promotes to expert if the calling user is
      // a TEACHER/EXPERT/MODERATOR+.
      final ans = await widget.api.postAnswer(widget.doubtId, text, source: 'peer');
      if (!mounted) return;
      _replyCtrl.clear();
      if (ans != null) await _load();
    } catch (_) {/* swallow */} finally {
      if (mounted) setState(() => _posting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuroraScaffold(
      appBar: AuroraAppBar(
        title: 'Doubt',
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: RefreshIndicator(
                onRefresh: _load,
                color: AlpColors.colorAi,
                child: _loading
                    ? const Center(child: AuroraSpinner(size: 32))
                    : _error != null
                        ? Center(child: Text(_error!, style: const TextStyle(color: AlpColors.colorRed)))
                        : _DoubtBody(
                            detail: _detail!,
                            aiStreaming: _aiStreaming,
                            aiBuffer: _aiBuffer,
                            onAskAi: _aiStreaming ? null : _askAi,
                          ),
              ),
            ),
            if (_detail != null && _detail!.summary.status != 'RESOLVED')
              _ReplyComposer(
                controller: _replyCtrl,
                posting: _posting,
                onSend: _postReply,
              ),
          ],
        ),
      ),
    );
  }
}

class _ReplyComposer extends StatelessWidget {
  const _ReplyComposer({required this.controller, required this.posting, required this.onSend});
  final TextEditingController controller;
  final bool posting;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AlpColors.bgSurface1,
        border: Border(top: BorderSide(color: AlpColors.borderDefault)),
      ),
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                color: AlpColors.bgSurface3,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: AlpColors.borderDefault),
              ),
              child: TextField(
                controller: controller,
                style: const TextStyle(fontSize: 14),
                minLines: 1,
                maxLines: 4,
                decoration: InputDecoration(
                  hintText: posting ? 'Posting…' : 'Add an answer or comment…',
                  hintStyle: const TextStyle(color: AlpColors.textMuted),
                  border: InputBorder.none,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                ),
                enabled: !posting,
                textInputAction: TextInputAction.send,
                onSubmitted: (_) => onSend(),
              ),
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: posting ? null : onSend,
            child: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                gradient: posting
                    ? null
                    : const LinearGradient(colors: [AlpColors.colorAi, AlpColors.colorPurple]),
                color: posting ? AlpColors.bgSurface3 : null,
                borderRadius: BorderRadius.circular(22),
              ),
              child: Icon(
                posting ? Icons.more_horiz : Icons.send_rounded,
                color: posting ? AlpColors.textMuted : Colors.white,
                size: 20,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _DoubtBody extends StatelessWidget {
  const _DoubtBody({
    required this.detail,
    this.aiStreaming = false,
    this.aiBuffer = '',
    this.onAskAi,
  });
  final DoubtDetail detail;
  final bool aiStreaming;
  final String aiBuffer;
  final VoidCallback? onAskAi;

  @override
  Widget build(BuildContext context) {
    final s = detail.summary;
    final answered = s.status == 'ANSWERED' || s.status == 'RESOLVED';
    final statusTone = s.status == 'RESOLVED'
        ? AlpColors.colorGreen
        : answered
            ? AlpColors.colorBlue
            : AlpColors.colorAmber;
    final hasAi = detail.answers.any((a) => a.source == 'ai');

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
      children: [
        // Question card
        AlpCard(
          padding: const EdgeInsets.all(16),
          borderColor: statusTone.withValues(alpha: 0.30),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  AlpPill(label: s.status, color: statusTone),
                  const Spacer(),
                  Text(
                    _relative(s.createdAt),
                    style: const TextStyle(color: AlpColors.textMuted, fontSize: 11),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                s.questionText,
                style: const TextStyle(
                  fontSize: 15,
                  height: 1.5,
                  fontWeight: FontWeight.w500,
                ),
              ),
              if (s.topicTitle != null && s.topicTitle!.isNotEmpty) ...[
                const SizedBox(height: 10),
                AlpPill(label: '◈ ${s.topicTitle}', color: AlpColors.colorPurple),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),
        Text(
          '${detail.answers.length} answer${detail.answers.length == 1 ? '' : 's'}',
          style: const TextStyle(color: AlpColors.textMuted, fontSize: 12, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: 8),
        if (detail.answers.isEmpty)
          const AlpCard(
            padding: EdgeInsets.all(20),
            child: Text(
              'No answers yet — tap "Ask AI Tutor" below or wait for an expert.',
              style: TextStyle(color: AlpColors.textMuted, fontSize: 13),
            ),
          )
        else
          ...detail.answers.map((a) => _AnswerCard(answer: a)),

        if (aiStreaming) ...[
          const SizedBox(height: 12),
          AlpCard(
            padding: const EdgeInsets.all(14),
            borderColor: AlpColors.colorAi.withValues(alpha: 0.5),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: const [
                    AlpPill(label: '◈ AI Tutor · streaming…', color: AlpColors.colorAi),
                  ],
                ),
                const SizedBox(height: 10),
                TutorReplyView(raw: aiBuffer, streaming: true),
              ],
            ),
          ),
        ],

        if (s.status != 'RESOLVED' && !aiStreaming && onAskAi != null) ...[
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: onAskAi,
              icon: const Icon(Icons.auto_awesome, color: AlpColors.colorAi, size: 18),
              label: Text(
                hasAi ? 'Ask AI follow-up' : 'Ask AI Tutor for help',
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                ),
              ),
              style: OutlinedButton.styleFrom(
                side: BorderSide(color: AlpColors.colorAi.withValues(alpha: 0.5)),
                padding: const EdgeInsets.symmetric(vertical: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _AnswerCard extends StatelessWidget {
  const _AnswerCard({required this.answer});
  final DoubtAnswer answer;

  @override
  Widget build(BuildContext context) {
    final isAi = answer.source == 'ai';
    final accent = isAi
        ? AlpColors.colorAi
        : answer.source == 'expert'
            ? AlpColors.colorGreen
            : AlpColors.colorBlue;
    final label = isAi ? '◈ AI Tutor' : answer.source == 'expert' ? 'Expert' : 'Peer';

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: AlpCard(
        padding: const EdgeInsets.all(14),
        borderColor: answer.accepted ? AlpColors.colorGreen : accent.withValues(alpha: 0.30),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                AlpPill(label: label, color: accent),
                if (answer.accepted) ...[
                  const SizedBox(width: 6),
                  const AlpPill(label: 'ACCEPTED', color: AlpColors.colorGreen),
                ],
                const Spacer(),
                Text(
                  _relative(answer.createdAt),
                  style: const TextStyle(color: AlpColors.textMuted, fontSize: 11),
                ),
              ],
            ),
            const SizedBox(height: 10),
            // Reuse the tutor markdown renderer so AI answers render LaTeX +
            // code blocks + tables. Peer/expert answers may still contain
            // markdown which is fine.
            TutorReplyView(
              raw: answer.content,
              streaming: false,
            ),
          ],
        ),
      ),
    );
  }
}

/// Build the messages array sent to /adaptive/tutor/chat from a doubt thread.
///
/// Maps the source-tagged answer stream to alternating user/assistant turns:
///   • original questionText → user
///   • peer answers (student follow-ups) → user
///   • ai / expert answers → assistant
///
/// When the last turn is from an assistant, appends a follow-up user prompt
/// so the model knows we want continuation, not a fresh first answer.
/// (Pure function — exposed for unit tests; the doubt detail screen is the
/// only production caller.)
List<TutorTurn> buildTutorMessages({
  required String questionText,
  required List<DoubtAnswer> answers,
}) {
  final sortedAnswers = [...answers]
    ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
  final messages = <TutorTurn>[
    TutorTurn(role: 'user', content: questionText),
  ];
  for (final a in sortedAnswers) {
    final role = a.source == 'peer' ? 'user' : 'assistant';
    messages.add(TutorTurn(role: role, content: a.content));
  }
  if (messages.length > 1 && messages.last.role == 'assistant') {
    messages.add(TutorTurn(
      role: 'user',
      content: 'Can you explain this further or give a worked example?',
    ),);
  }
  return messages;
}

String _relative(String iso) {
  try {
    final t = DateTime.parse(iso).toLocal();
    final delta = DateTime.now().difference(t);
    if (delta.inSeconds < 60) return 'just now';
    if (delta.inMinutes < 60) return '${delta.inMinutes}m ago';
    if (delta.inHours < 24) return '${delta.inHours}h ago';
    if (delta.inDays < 7) return '${delta.inDays}d ago';
    return '${t.day}/${t.month}/${t.year}';
  } catch (_) {
    return iso;
  }
}
