// VidyaTutorChatScreen — Phase D. Native AI-tutor chat (replaces the Aurora
// DoubtsTab entry). Streams the tutor's reply token-by-token via
// ApiClient.tutorChat (POST /adaptive/tutor/chat, text/event-stream),
// accumulating deltas into a growing assistant bubble.
//
// This is the last More-hub surface to go native — retiring AuroraRoute
// from the hub entirely.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../auth/auth_client.dart';

class VidyaTutorChatScreen extends StatefulWidget {
  final AuthClient auth;

  /// Optional topic context for the tutor. Empty = a general session.
  final String topicId;
  final String? topicTitle;
  const VidyaTutorChatScreen({
    super.key,
    required this.auth,
    this.topicId = '',
    this.topicTitle,
  });

  @override
  State<VidyaTutorChatScreen> createState() => _VidyaTutorChatScreenState();
}

class _Turn {
  _Turn({required this.role, this.content = ''});
  final String role; // user | assistant
  String content;
}

class _VidyaTutorChatScreenState extends State<VidyaTutorChatScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final List<_Turn> _turns = [];
  bool _sending = false;

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _send() {
    final text = _input.text.trim();
    if (text.isEmpty || _sending) return;
    _input.clear();
    setState(() {
      _turns.add(_Turn(role: 'user', content: text));
      _turns.add(_Turn(role: 'assistant')); // streaming target
      _sending = true;
    });
    _scrollToEnd();

    // History excludes the empty assistant placeholder we just added.
    final history = [
      for (final t in _turns)
        if (!(t.role == 'assistant' && t.content.isEmpty))
          TutorTurn(role: t.role, content: t.content),
    ];

    final stream = ApiClient(widget.auth).tutorChat(
      topicId: widget.topicId,
      messages: history,
      userId: widget.auth.user?.id,
    );
    stream.listen(
      (delta) {
        if (!mounted) return;
        setState(() => _turns.last.content += delta);
        _scrollToEnd();
      },
      onDone: () {
        if (mounted) setState(() => _sending = false);
      },
      onError: (_) {
        if (!mounted) return;
        setState(() {
          if (_turns.last.content.isEmpty) {
            _turns.last.content =
                "Sorry — the tutor isn't reachable right now.";
          }
          _sending = false;
        });
      },
    );
  }

  void _scrollToEnd() {
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
    final v = VidyaThemeData.of(context);
    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: widget.topicTitle?.isNotEmpty == true
            ? widget.topicTitle!
            : 'AI tutor',
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: v.ink),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: _turns.isEmpty
                ? _Intro(v: v)
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
                    itemCount: _turns.length,
                    itemBuilder: (_, i) => _Bubble(turn: _turns[i]),
                  ),
          ),
          _Composer(
            controller: _input,
            sending: _sending,
            onSend: _send,
          ),
        ],
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  final _Turn turn;
  const _Bubble({required this.turn});

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    final isUser = turn.role == 'user';
    final waiting = !isUser && turn.content.isEmpty;
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.78,
        ),
        decoration: BoxDecoration(
          color: isUser ? v.accent : v.card,
          borderRadius: BorderRadius.circular(14),
          border: isUser ? null : Border.all(color: v.rule),
        ),
        child: waiting
            ? SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  valueColor: AlwaysStoppedAnimation<Color>(v.ink3),
                ),
              )
            : Text(
                turn.content,
                style: TextStyle(
                  fontFamily: VidyaFonts.ui,
                  fontSize: 15,
                  height: 1.4,
                  color: isUser ? Colors.white : v.ink,
                ),
              ),
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  final TextEditingController controller;
  final bool sending;
  final VoidCallback onSend;
  const _Composer({
    required this.controller,
    required this.sending,
    required this.onSend,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
        decoration: BoxDecoration(
          color: v.paper,
          border: Border(top: BorderSide(color: v.rule)),
        ),
        child: Row(
          children: [
            Expanded(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                decoration: BoxDecoration(
                  color: v.card,
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: v.rule),
                ),
                child: TextField(
                  controller: controller,
                  minLines: 1,
                  maxLines: 4,
                  textInputAction: TextInputAction.send,
                  onSubmitted: (_) => onSend(),
                  style: TextStyle(color: v.ink, fontFamily: VidyaFonts.ui),
                  decoration: InputDecoration(
                    border: InputBorder.none,
                    hintText: 'Ask the tutor anything…',
                    hintStyle: TextStyle(color: v.ink3),
                    contentPadding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Material(
              color: v.accent,
              shape: const CircleBorder(),
              child: InkWell(
                customBorder: const CircleBorder(),
                onTap: sending ? null : onSend,
                child: Padding(
                  padding: const EdgeInsets.all(10),
                  child: Icon(
                    sending ? Icons.hourglass_empty : Icons.arrow_upward,
                    size: 22,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Intro extends StatelessWidget {
  final VidyaThemeData v;
  const _Intro({required this.v});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.auto_awesome, size: 44, color: v.accent),
            const SizedBox(height: 16),
            Text(
              'Ask your AI tutor',
              style: TextStyle(
                fontFamily: VidyaFonts.display,
                fontSize: 22,
                fontWeight: FontWeight.w500,
                color: v.ink,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Stuck on a concept or a question? Ask in plain words and the '
              'tutor will walk you through it.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontFamily: VidyaFonts.ui,
                fontSize: 14,
                color: v.ink2,
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
