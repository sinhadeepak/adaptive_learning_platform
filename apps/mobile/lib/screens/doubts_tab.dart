import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../api/api_client.dart';
import '../auth/auth_client.dart';
import '../widgets/alp_card.dart';
import '../widgets/tutor_message.dart';
import 'doubt_detail_screen.dart';

/// Doubts forum surface — entry to the photo-doubt OCR flow + AI tutor chat.
/// We don't have a Q&A backend yet; the recent-doubts list is a UI sketch
/// until that lands. Mirrors docs/ui/02_MobileApp screenshot 7.
class DoubtsTab extends StatefulWidget {
  const DoubtsTab({super.key, required this.api, required this.auth});
  final ApiClient api;
  final AuthClient auth;

  @override
  State<DoubtsTab> createState() => _DoubtsTabState();
}

class _DoubtsTabState extends State<DoubtsTab> {
  String _filter = 'All';
  List<DoubtSummary>? _doubts;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    setState(() => _loading = true);
    try {
      final list = await widget.api.listMyDoubts();
      if (!mounted) return;
      setState(() {
        _doubts = list;
        _loading = false;
      });
    } catch (_) {
      if (mounted) {
        setState(() {
          _doubts = [];
          _loading = false;
        });
      }
    }
  }

  List<DoubtSummary> get _filteredItems {
    final all = _doubts ?? const <DoubtSummary>[];
    switch (_filter) {
      case 'Unanswered':
        return all.where((d) => d.status == 'OPEN').toList();
      case 'Resolved':
        return all.where((d) => d.status == 'ANSWERED' || d.status == 'RESOLVED').toList();
      default:
        return all;
    }
  }

  Future<void> _openPhotoDoubt() async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => PhotoDoubtScreen(api: widget.api),
    ),);
    if (mounted) _refresh();
  }

  Future<void> _openTutor() async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => TutorChatScreen(api: widget.api, auth: widget.auth),
    ),);
    if (mounted) _refresh();
  }

  Future<void> _openDetail(String doubtId) async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => DoubtDetailScreen(api: widget.api, doubtId: doubtId),
    ),);
    if (mounted) _refresh();
  }

  void _showAskSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: AlpColors.bgSurface1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'How would you like to ask?',
                style: TextStyle(color: AlpColors.textPrimary, fontSize: 16, fontWeight: FontWeight.w700),
              ),
              const SizedBox(height: 16),
              _AskOptionTile(
                icon: Icons.photo_camera_outlined,
                title: 'Snap a photo',
                subtitle: 'OCR a handwritten or printed question',
                tone: AlpColors.colorBlue,
                onTap: () {
                  Navigator.pop(context);
                  _openPhotoDoubt();
                },
              ),
              const SizedBox(height: 10),
              _AskOptionTile(
                icon: Icons.auto_awesome,
                title: 'Ask AI tutor',
                subtitle: 'Streaming chat with markdown + follow-ups',
                tone: AlpColors.colorAi,
                onTap: () {
                  Navigator.pop(context);
                  _openTutor();
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _refresh,
      backgroundColor: AlpColors.bgSurface2,
      color: AlpColors.colorAi,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        children: _buildBody(),
      ),
    );
  }

  List<Widget> _buildBody() {
    return [
        const Row(
          children: [
            Text(
              'Doubts Forum ',
              style: TextStyle(color: AlpColors.textPrimary, fontSize: 24, fontWeight: FontWeight.w700),
            ),
            Text('💬', style: TextStyle(fontSize: 22)),
          ],
        ),
        const SizedBox(height: 4),
        const Text(
          'Ask questions, get expert answers',
          style: TextStyle(color: AlpColors.textMuted, fontSize: 13),
        ),
        const SizedBox(height: 16),

        // Big "Ask New Doubt" gradient CTA
        Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: _showAskSheet,
            borderRadius: BorderRadius.circular(14),
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 18),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [AlpColors.colorBlue, AlpColors.colorPurple],
                ),
                borderRadius: BorderRadius.circular(14),
                boxShadow: [
                  BoxShadow(
                    color: AlpColors.colorBlue.withValues(alpha: 0.30),
                    blurRadius: 16,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.add, color: Colors.white, size: 18),
                  SizedBox(width: 8),
                  Text(
                    'Ask New Doubt',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),

        const SizedBox(height: 16),

        // Filter tabs
        Container(
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            color: AlpColors.bgSurface2,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AlpColors.borderDefault),
          ),
          child: Row(
            children: ['All', 'Unanswered', 'Resolved'].map((label) {
              final active = _filter == label;
              return Expanded(
                child: GestureDetector(
                  onTap: () => setState(() => _filter = label),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(
                      color: active ? AlpColors.bgSurface3 : Colors.transparent,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      label,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: active ? AlpColors.textPrimary : AlpColors.textMuted,
                        fontSize: 12,
                        fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                      ),
                    ),
                  ),
                ),
              );
            }).toList(),
          ),
        ),
        const SizedBox(height: 12),

        if (_loading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 32),
            child: Center(child: CircularProgressIndicator(color: AlpColors.colorAi)),
          )
        else if (_filteredItems.isEmpty)
          const AlpCard(
            padding: EdgeInsets.all(20),
            child: Column(
              children: [
                Icon(Icons.inbox_outlined, color: AlpColors.textMuted, size: 36),
                SizedBox(height: 8),
                Text(
                  'No doubts in this view',
                  style: TextStyle(color: AlpColors.textPrimary, fontSize: 14, fontWeight: FontWeight.w600),
                ),
                SizedBox(height: 4),
                Text(
                  'Tap "+ Ask New Doubt" — your history will appear here.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: AlpColors.textMuted, fontSize: 12),
                ),
              ],
            ),
          )
        else
          ..._filteredItems.map((d) => _DoubtCard(item: d, onTap: () => _openDetail(d.id))),
      ];
  }
}

class _DoubtCard extends StatelessWidget {
  const _DoubtCard({required this.item, required this.onTap});
  final DoubtSummary item;
  final VoidCallback onTap;

  String _relative() {
    try {
      final t = DateTime.parse(item.lastActivityAt).toLocal();
      final delta = DateTime.now().difference(t);
      if (delta.inSeconds < 60) return 'just now';
      if (delta.inMinutes < 60) return '${delta.inMinutes}m ago';
      if (delta.inHours < 24) return '${delta.inHours}h ago';
      if (delta.inDays < 7) return '${delta.inDays}d ago';
      return '${t.day}/${t.month}/${t.year}';
    } catch (_) {
      return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    final answered = item.status == 'ANSWERED' || item.status == 'RESOLVED';
    final resolved = item.status == 'RESOLVED';
    final statusColor = resolved
        ? AlpColors.colorGreen
        : answered
            ? AlpColors.colorBlue
            : AlpColors.colorAmber;
    final preview = item.questionText.length > 140
        ? '${item.questionText.substring(0, 140)}…'
        : item.questionText;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: AlpCard(
        onTap: onTap,
        padding: const EdgeInsets.all(14),
        borderColor: statusColor.withValues(alpha: 0.30),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                AlpPill(label: item.status, color: statusColor),
                const Spacer(),
                Text(
                  _relative(),
                  style: const TextStyle(color: AlpColors.textMuted, fontSize: 11),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              preview,
              style: const TextStyle(color: AlpColors.textPrimary, fontSize: 13, height: 1.5),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                if (item.topicTitle != null && item.topicTitle!.isNotEmpty)
                  AlpPill(label: '◈ ${item.topicTitle}', color: AlpColors.colorPurple)
                else
                  const AlpPill(label: '◈ AI tutor', color: AlpColors.colorAi),
                const Spacer(),
                if (item.answerCount > 0)
                  Text(
                    '${item.answerCount} answer${item.answerCount == 1 ? '' : 's'}',
                    style: const TextStyle(color: AlpColors.textMuted, fontSize: 11),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _AskOptionTile extends StatelessWidget {
  const _AskOptionTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.tone,
    required this.onTap,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final Color tone;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return AlpCard(
      onTap: onTap,
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: tone.withValues(alpha: 0.18),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: tone, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(color: AlpColors.textPrimary, fontSize: 14, fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: const TextStyle(color: AlpColors.textMuted, fontSize: 11),
                ),
              ],
            ),
          ),
          const Icon(Icons.chevron_right, color: AlpColors.textMuted),
        ],
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────────────────
// Photo Doubt screen
// ──────────────────────────────────────────────────────────────────────

class PhotoDoubtScreen extends StatefulWidget {
  const PhotoDoubtScreen({super.key, required this.api});
  final ApiClient api;

  @override
  State<PhotoDoubtScreen> createState() => _PhotoDoubtScreenState();
}

class _PhotoDoubtScreenState extends State<PhotoDoubtScreen> {
  final ImagePicker _picker = ImagePicker();
  Uint8List? _bytes;
  String _mime = 'image/jpeg';
  DoubtPhotoResult? _result;
  bool _loading = false;
  String? _error;

  Future<void> _pickFrom(ImageSource source) async {
    setState(() {
      _error = null;
      _result = null;
    });
    try {
      final picked = await _picker.pickImage(
        source: source,
        imageQuality: 85,
        maxWidth: 1600,
      );
      if (picked == null) return;
      final bytes = await picked.readAsBytes();
      final mime = picked.mimeType ?? _guessMime(picked.path);
      setState(() {
        _bytes = bytes;
        _mime = mime;
      });
      await _solve();
    } catch (e) {
      setState(() => _error = 'Picker error: $e');
    }
  }

  String _guessMime(String path) {
    final lower = path.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
    return 'image/jpeg';
  }

  Future<void> _solve() async {
    if (_bytes == null) return;
    setState(() => _loading = true);
    try {
      final res = await widget.api.solvePhotoDoubt(_bytes!, _mime);
      if (!mounted) return;
      setState(() {
        _result = res;
        _loading = false;
      });
      // Persist this doubt to the Doubts service so it shows up in the
      // forum history. Best-effort: a save failure shouldn't break the
      // photo-doubt result UX, so we swallow errors.
      if (res.source == 'ai' && res.extracted.isNotEmpty) {
        final answer = _formatPhotoAnswer(res);
        try {
          await widget.api.createDoubt(
            questionText: res.extracted,
            topicId: res.matchedTopicId,
            topicTitle: res.suggestedTopic.isEmpty ? null : res.suggestedTopic,
            initialAiAnswer: answer,
          );
        } catch (_) {/* swallow */}
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Solve failed: $e';
        _loading = false;
      });
    }
  }

  String _formatPhotoAnswer(DoubtPhotoResult r) {
    // Render the structured photo result as markdown so the doubt thread
    // renders cleanly with the existing TutorReplyView.
    final buf = StringBuffer();
    if (r.solutionSteps.isNotEmpty) {
      for (var i = 0; i < r.solutionSteps.length; i++) {
        buf.writeln('${i + 1}. ${r.solutionSteps[i]}');
      }
    }
    if (r.finalAnswer.isNotEmpty) {
      buf.writeln();
      buf.writeln('**Final answer:** ${r.finalAnswer}');
    }
    return buf.toString().trim();
  }

  void _showSourceSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: AlpColors.bgSurface1,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AlpColors.borderStrong,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 18),
              ListTile(
                leading: const Icon(Icons.photo_camera, color: AlpColors.colorBlue),
                title: const Text('Take a photo', style: TextStyle(color: AlpColors.textPrimary)),
                subtitle: const Text(
                  'Snap the question with your camera',
                  style: TextStyle(color: AlpColors.textMuted, fontSize: 12),
                ),
                onTap: () {
                  Navigator.pop(context);
                  _pickFrom(ImageSource.camera);
                },
              ),
              ListTile(
                leading: const Icon(Icons.photo_library_outlined, color: AlpColors.colorPurple),
                title: const Text('Pick from gallery', style: TextStyle(color: AlpColors.textPrimary)),
                subtitle: const Text(
                  'Choose an existing image',
                  style: TextStyle(color: AlpColors.textMuted, fontSize: 12),
                ),
                onTap: () {
                  Navigator.pop(context);
                  _pickFrom(ImageSource.gallery);
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _reset() {
    setState(() {
      _bytes = null;
      _result = null;
      _error = null;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AlpColors.bgBase,
      appBar: AppBar(
        title: const Text('Photo Doubt'),
        backgroundColor: AlpColors.bgSurface1,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        children: [
          AlpCard(
            padding: const EdgeInsets.all(18),
            child: Column(
              children: [
                if (_bytes != null)
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.memory(_bytes!, height: 220, fit: BoxFit.cover),
                  )
                else
                  GestureDetector(
                    onTap: _showSourceSheet,
                    child: Container(
                      height: 220,
                      decoration: BoxDecoration(
                        color: AlpColors.bgSurface3,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: AlpColors.colorAi.withValues(alpha: 0.30),
                          style: BorderStyle.solid,
                          width: 1.5,
                        ),
                      ),
                      child: const Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.add_a_photo_outlined, color: AlpColors.colorAi, size: 48),
                            SizedBox(height: 12),
                            Text(
                              'Tap to take or pick a photo',
                              style: TextStyle(color: AlpColors.textPrimary, fontSize: 14, fontWeight: FontWeight.w600),
                            ),
                            SizedBox(height: 4),
                            Text(
                              'Camera · Gallery · screenshot',
                              style: TextStyle(color: AlpColors.textMuted, fontSize: 11),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _bytes == null ? _showSourceSheet : _reset,
                        icon: Icon(
                          _bytes == null ? Icons.image_outlined : Icons.refresh,
                          color: AlpColors.textPrimary,
                        ),
                        label: Text(
                          _bytes == null ? 'Pick image' : 'Pick another',
                          style: const TextStyle(color: AlpColors.textPrimary),
                        ),
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(color: AlpColors.borderStrong),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                      ),
                    ),
                    if (_bytes != null && _result == null && !_loading) ...[
                      const SizedBox(width: 8),
                      Expanded(
                        child: ElevatedButton.icon(
                          onPressed: _solve,
                          icon: const Icon(Icons.auto_awesome),
                          label: const Text('Solve'),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AlpColors.colorBlue,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 12),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
                if (_error != null) ...[
                  const SizedBox(height: 10),
                  Text(_error!, style: const TextStyle(color: AlpColors.colorAmber, fontSize: 12)),
                ],
              ],
            ),
          ),
          if (_loading) ...[
            const SizedBox(height: 24),
            const Center(child: CircularProgressIndicator(color: AlpColors.colorAi)),
            const SizedBox(height: 8),
            const Center(
              child: Text(
                'Reading the question and working out the solution…',
                style: TextStyle(color: AlpColors.textMuted, fontSize: 12),
              ),
            ),
          ] else if (_result != null) ...[
            const SizedBox(height: 16),
            _ResultPanel(result: _result!),
          ],
        ],
      ),
    );
  }
}

class _ResultPanel extends StatelessWidget {
  const _ResultPanel({required this.result});
  final DoubtPhotoResult result;

  @override
  Widget build(BuildContext context) {
    return AlpCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AlpPill(
            label: result.source == 'ai' ? '◈ AI vision' : '◈ Stub',
            color: result.source == 'ai' ? AlpColors.colorBlue : AlpColors.textMuted,
          ),
          if (result.extracted.isNotEmpty) ...[
            const SizedBox(height: 10),
            const Text('Question read', style: TextStyle(color: AlpColors.textMuted, fontSize: 11)),
            const SizedBox(height: 4),
            Text(result.extracted, style: const TextStyle(color: AlpColors.textPrimary, fontSize: 14)),
          ],
          if (result.solutionSteps.isNotEmpty) ...[
            const SizedBox(height: 10),
            const Text('Solution', style: TextStyle(color: AlpColors.textMuted, fontSize: 11)),
            const SizedBox(height: 4),
            ...result.solutionSteps.asMap().entries.map((e) => Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    '${e.key + 1}. ${e.value}',
                    style: const TextStyle(color: AlpColors.textSecondary, fontSize: 13, height: 1.5),
                  ),
                ),),
          ],
          if (result.finalAnswer.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AlpColors.colorGreen.withValues(alpha: 0.10),
                borderRadius: BorderRadius.circular(8),
                border: const Border(left: BorderSide(color: AlpColors.colorGreen, width: 2)),
              ),
              child: Text(
                result.finalAnswer,
                style: const TextStyle(color: AlpColors.colorGreen, fontSize: 14, fontWeight: FontWeight.w700),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ──────────────────────────────────────────────────────────────────────
// Tutor chat screen (streaming SSE)
// ──────────────────────────────────────────────────────────────────────

class TutorChatScreen extends StatefulWidget {
  const TutorChatScreen({super.key, required this.api, required this.auth});
  final ApiClient api;
  final AuthClient auth;

  @override
  State<TutorChatScreen> createState() => _TutorChatScreenState();
}

class _TutorChatScreenState extends State<TutorChatScreen> {
  static const _topicId = '33333333-0000-0000-0000-000000000001'; // Mechanics seed
  static const _starterPrompts = [
    'Explain Newton\'s third law with a real example',
    'Walk me through projectile motion step by step',
    'Why does a heavier object fall at the same rate as a lighter one?',
    'How do I solve circular motion problems?',
  ];

  final TextEditingController _input = TextEditingController();
  final ScrollController _scroll = ScrollController();
  final List<TutorTurn> _messages = [];
  bool _streaming = false;

  String? _doubtId; // server-side doubt thread; created on first user turn
  bool _firstTurn = true;

  Future<void> _send([String? overrideText]) async {
    final text = (overrideText ?? _input.text).trim();
    if (text.isEmpty || _streaming) return;
    final isFirstUserTurn = _firstTurn;
    setState(() {
      _messages.add(TutorTurn(role: 'user', content: text));
      _messages.add(TutorTurn(role: 'assistant', content: ''));
      _streaming = true;
      _firstTurn = false;
      _input.clear();
    });
    _autoScroll();
    try {
      final stream = widget.api.tutorChat(
        topicId: _topicId,
        messages: _messages.where((m) => m.role == 'user' || m.content.isNotEmpty).toList(),
        userId: widget.auth.user?.id,
      );
      final buffer = StringBuffer();
      await for (final delta in stream) {
        buffer.write(delta);
        if (!mounted) return;
        setState(() {
          _messages[_messages.length - 1] = TutorTurn(role: 'assistant', content: buffer.toString());
        });
        _autoScroll();
      }
      // Persist as a doubt thread. First turn creates a new doubt with the
      // initial AI answer; subsequent turns append answers. Best-effort —
      // network failures don't break the chat.
      final finalReply = buffer.toString();
      if (finalReply.isNotEmpty) {
        try {
          if (isFirstUserTurn) {
            final detail = await widget.api.createDoubt(
              questionText: text,
              topicTitle: 'Mechanics',
              initialAiAnswer: finalReply,
            );
            if (detail != null && mounted) _doubtId = detail.summary.id;
          } else if (_doubtId != null) {
            await widget.api.postAnswer(_doubtId!, finalReply, source: 'ai');
          }
        } catch (_) {/* swallow — chat continues to work without persistence */}
      }
    } finally {
      if (mounted) setState(() => _streaming = false);
    }
  }

  void _autoScroll() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AlpColors.bgBase,
      appBar: AppBar(
        backgroundColor: AlpColors.bgSurface1,
        title: const Row(
          children: [
            Icon(Icons.auto_awesome, color: AlpColors.colorAi, size: 18),
            SizedBox(width: 8),
            Text('AI Tutor'),
            SizedBox(width: 8),
            Text('· Mechanics', style: TextStyle(color: AlpColors.textMuted, fontSize: 13, fontWeight: FontWeight.w400)),
          ],
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: _messages.isEmpty
                ? _EmptyState(prompts: _starterPrompts, onPrompt: _send)
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                    itemCount: _messages.length,
                    itemBuilder: (_, i) {
                      final m = _messages[i];
                      final isUser = m.role == 'user';
                      final isLast = i == _messages.length - 1;
                      final isStreamingThis = isLast && _streaming && !isUser;
                      return Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: isUser
                            ? _UserBubble(text: m.content)
                            : _AssistantBubble(
                                raw: m.content,
                                streaming: isStreamingThis,
                                onFollowup: (q) => _send(q),
                              ),
                      );
                    },
                  ),
          ),
          _Composer(
            controller: _input,
            streaming: _streaming,
            onSend: () => _send(),
          ),
        ],
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.prompts, required this.onPrompt});
  final List<String> prompts;
  final ValueChanged<String> onPrompt;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 32, 20, 16),
      children: [
        Center(
          child: Container(
            width: 72,
            height: 72,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [AlpColors.colorAi, AlpColors.colorPurple],
              ),
              borderRadius: BorderRadius.circular(18),
              boxShadow: [
                BoxShadow(
                  color: AlpColors.colorAi.withValues(alpha: 0.30),
                  blurRadius: 16,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: const Icon(Icons.auto_awesome, color: Colors.white, size: 36),
          ),
        ),
        const SizedBox(height: 16),
        const Text(
          'AI Tutor',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: AlpColors.textPrimary,
            fontSize: 22,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'Ask anything about Mechanics. Replies stream in with full markdown\nplus suggested follow-up questions.',
          textAlign: TextAlign.center,
          style: TextStyle(color: AlpColors.textMuted, fontSize: 13, height: 1.5),
        ),
        const SizedBox(height: 24),
        const Text(
          'TRY ASKING',
          style: TextStyle(
            color: AlpColors.textMuted,
            fontSize: 11,
            letterSpacing: 0.8,
            fontWeight: FontWeight.w700,
          ),
        ),
        const SizedBox(height: 10),
        ...prompts.map((p) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: AlpCard(
                onTap: () => onPrompt(p),
                padding: const EdgeInsets.all(14),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        p,
                        style: const TextStyle(
                          color: AlpColors.textPrimary,
                          fontSize: 13,
                          height: 1.4,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    const Icon(Icons.north_east, color: AlpColors.colorAi, size: 16),
                  ],
                ),
              ),
            ),),
      ],
    );
  }
}

class _UserBubble extends StatelessWidget {
  const _UserBubble({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Align(
      alignment: Alignment.centerRight,
      child: Container(
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.80),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [AlpColors.colorBlue, Color(0xFF7B68EE)],
          ),
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(14),
            topRight: Radius.circular(14),
            bottomLeft: Radius.circular(14),
            bottomRight: Radius.circular(4),
          ),
        ),
        child: Text(
          text,
          style: const TextStyle(color: Colors.white, fontSize: 14, height: 1.5),
        ),
      ),
    );
  }
}

class _AssistantBubble extends StatelessWidget {
  const _AssistantBubble({
    required this.raw,
    required this.streaming,
    required this.onFollowup,
  });
  final String raw;
  final bool streaming;
  final ValueChanged<String> onFollowup;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 32,
          height: 32,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [AlpColors.colorAi, AlpColors.colorPurple],
            ),
            borderRadius: BorderRadius.circular(10),
          ),
          child: const Icon(Icons.auto_awesome, color: Colors.white, size: 16),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Container(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            decoration: BoxDecoration(
              color: AlpColors.bgSurface2,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(4),
                topRight: Radius.circular(14),
                bottomLeft: Radius.circular(14),
                bottomRight: Radius.circular(14),
              ),
              border: Border.all(color: AlpColors.borderDefault),
            ),
            child: TutorReplyView(
              raw: raw,
              streaming: streaming,
              onFollowup: onFollowup,
            ),
          ),
        ),
      ],
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({required this.controller, required this.streaming, required this.onSend});
  final TextEditingController controller;
  final bool streaming;
  final VoidCallback onSend;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AlpColors.bgSurface1,
        border: Border(top: BorderSide(color: AlpColors.borderDefault)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
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
                    style: const TextStyle(color: AlpColors.textPrimary, fontSize: 14),
                    minLines: 1,
                    maxLines: 4,
                    decoration: InputDecoration(
                      hintText: streaming ? 'Tutor is replying…' : 'Ask the tutor anything…',
                      hintStyle: const TextStyle(color: AlpColors.textMuted),
                      border: InputBorder.none,
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    ),
                    enabled: !streaming,
                    onSubmitted: (_) => onSend(),
                    textInputAction: TextInputAction.send,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: streaming ? null : onSend,
                child: Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    gradient: streaming
                        ? null
                        : const LinearGradient(colors: [AlpColors.colorAi, AlpColors.colorPurple]),
                    color: streaming ? AlpColors.bgSurface3 : null,
                    borderRadius: BorderRadius.circular(22),
                  ),
                  child: Icon(
                    streaming ? Icons.more_horiz : Icons.arrow_upward_rounded,
                    color: streaming ? AlpColors.textMuted : Colors.white,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
