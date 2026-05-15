// AITutorPane — chat surface with citations + photo upload.
//
// Spec: docs/02-design/design-system-v2-aurora-mobile.md §8.4
//
// Used inside `/doubts/:id` and `/experts`. Renders the message list
// + composer in a clean column. Caller owns:
//   - the messages list (push to it via state)
//   - send-handler (text + optional image attachment)
//   - photo-pick handler (we surface the camera/gallery picker icon)
//
// Each AITutorMessage may carry zero or more citations: small chips
// that the caller can wire to drill-down on tap.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import 'aurora_avatar.dart';
import 'aurora_card.dart';
import 'aurora_tag.dart';

enum AITutorRole { student, tutor }

class AITutorCitation {
  const AITutorCitation({
    required this.label,
    required this.onTap,
  });

  final String label;
  final VoidCallback onTap;
}

class AITutorMessage {
  const AITutorMessage({
    required this.role,
    required this.text,
    this.imageAttachment,
    this.citations = const [],
    this.timestamp,
  });

  final AITutorRole role;
  final String text;
  final ImageProvider? imageAttachment;
  final List<AITutorCitation> citations;
  final DateTime? timestamp;
}

class AITutorPane extends StatefulWidget {
  const AITutorPane({
    super.key,
    required this.messages,
    required this.onSend,
    this.onPickPhoto,
    this.isStreaming = false,
    this.tutorName = 'Tutor',
    this.tutorAvatar,
    this.hintText = 'Ask a question…',
  });

  final List<AITutorMessage> messages;
  final void Function(String text) onSend;
  final VoidCallback? onPickPhoto;

  /// When true, a typing-indicator row appears at the end.
  final bool isStreaming;
  final String tutorName;
  final ImageProvider? tutorAvatar;
  final String hintText;

  @override
  State<AITutorPane> createState() => _AITutorPaneState();
}

class _AITutorPaneState extends State<AITutorPane> {
  final _ctrl = TextEditingController();
  final _scrollCtrl = ScrollController();

  @override
  void didUpdateWidget(covariant AITutorPane old) {
    super.didUpdateWidget(old);
    if (old.messages.length != widget.messages.length) {
      _scrollToBottom();
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollCtrl.hasClients) return;
      _scrollCtrl.animateTo(
        _scrollCtrl.position.maxScrollExtent,
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOut,
      );
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;

    return Column(
      children: [
        Expanded(
          child: ListView.separated(
            controller: _scrollCtrl,
            padding: EdgeInsets.all(12 * density.spaceScale),
            itemCount:
                widget.messages.length + (widget.isStreaming ? 1 : 0),
            separatorBuilder: (_, __) =>
                SizedBox(height: 10 * density.spaceScale),
            itemBuilder: (ctx, i) {
              if (i >= widget.messages.length) {
                return _TypingRow(
                    tutorName: widget.tutorName,
                    tutorAvatar: widget.tutorAvatar,);
              }
              return _MessageRow(
                  message: widget.messages[i],
                  tutorName: widget.tutorName,
                  tutorAvatar: widget.tutorAvatar,);
            },
          ),
        ),
        Container(
          decoration: BoxDecoration(
            color: colors.neutral0,
            border: Border(top: BorderSide(color: colors.neutral200)),
          ),
          padding: EdgeInsets.fromLTRB(
            8 * density.spaceScale,
            8 * density.spaceScale,
            8 * density.spaceScale,
            8 * density.spaceScale,
          ),
          child: Row(
            children: [
              if (widget.onPickPhoto != null)
                IconButton(
                  icon: const Icon(Icons.camera_alt_outlined),
                  color: colors.neutral700,
                  onPressed: widget.onPickPhoto,
                  tooltip: 'Snap a doubt',
                ),
              Expanded(
                child: TextField(
                  controller: _ctrl,
                  minLines: 1,
                  maxLines: 4,
                  textInputAction: TextInputAction.send,
                  onSubmitted: _handleSend,
                  decoration: InputDecoration(
                    hintText: widget.hintText,
                    isDense: true,
                    contentPadding: EdgeInsets.symmetric(
                      horizontal: 12 * density.spaceScale,
                      vertical: 10 * density.spaceScale,
                    ),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(20),
                      borderSide: BorderSide(color: colors.neutral200),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(20),
                      borderSide: BorderSide(color: colors.neutral200),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(20),
                      borderSide: BorderSide(color: colors.brand500, width: 1.5),
                    ),
                  ),
                  style: typography.body
                      .copyWith(color: colors.neutral900),
                ),
              ),
              SizedBox(width: 6 * density.spaceScale),
              IconButton.filled(
                icon: const Icon(Icons.send, size: 18),
                color: colors.neutral0,
                style: IconButton.styleFrom(
                  backgroundColor: colors.brand600,
                ),
                onPressed: () => _handleSend(_ctrl.text),
                tooltip: 'Send',
              ),
            ],
          ),
        ),
      ],
    );
  }

  void _handleSend(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) return;
    widget.onSend(trimmed);
    _ctrl.clear();
    _scrollToBottom();
  }
}

class _MessageRow extends StatelessWidget {
  const _MessageRow({
    required this.message,
    required this.tutorName,
    required this.tutorAvatar,
  });

  final AITutorMessage message;
  final String tutorName;
  final ImageProvider? tutorAvatar;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;

    final isTutor = message.role == AITutorRole.tutor;
    final bubbleColor =
        isTutor ? colors.neutral0 : colors.brand600;
    final textColor =
        isTutor ? colors.neutral900 : colors.neutral0;

    final bubble = AuroraCard(
      surface: AuroraCardSurface.tier1,
      padding: AuroraCardPadding.md,
      tone: AuroraCardTone.neutral,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (message.imageAttachment != null) ...[
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image(
                image: message.imageAttachment!,
                fit: BoxFit.cover,
                height: 140,
              ),
            ),
            SizedBox(height: 8 * density.spaceScale),
          ],
          Text(
            message.text,
            style: typography.body.copyWith(color: textColor, height: 1.45),
          ),
          if (message.citations.isNotEmpty) ...[
            SizedBox(height: 8 * density.spaceScale),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final c in message.citations)
                  GestureDetector(
                    onTap: c.onTap,
                    child: AuroraTag(
                      label: c.label,
                      tone: AuroraTagTone.brand,
                      iconLeft: const Icon(Icons.link, size: 12),
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );

    // Override bubble background — AuroraCard uses tier1 neutral; we
    // wrap in a Container with the role-coloured background for student
    // bubbles. Keeps tier1 surface for tutor messages.
    final wrapped = isTutor
        ? bubble
        : Container(
            padding: EdgeInsets.symmetric(
              horizontal: 14 * density.spaceScale,
              vertical: 10 * density.spaceScale,
            ),
            decoration: BoxDecoration(
              color: bubbleColor,
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(14),
                topRight: Radius.circular(14),
                bottomLeft: Radius.circular(14),
                bottomRight: Radius.circular(4),
              ),
            ),
            child: Text(
              message.text,
              style: typography.body
                  .copyWith(color: textColor, height: 1.45),
            ),
          );

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisAlignment:
          isTutor ? MainAxisAlignment.start : MainAxisAlignment.end,
      children: [
        if (isTutor) ...[
          AuroraAvatar(
              name: tutorName,
              image: tutorAvatar,
              size: AuroraAvatarSize.sm,),
          SizedBox(width: 8 * density.spaceScale),
        ],
        Flexible(
            child: ConstrainedBox(
                constraints: BoxConstraints(
                    maxWidth: MediaQuery.of(context).size.width * 0.78,),
                child: wrapped,),),
      ],
    );
  }
}

class _TypingRow extends StatelessWidget {
  const _TypingRow({required this.tutorName, required this.tutorAvatar});
  final String tutorName;
  final ImageProvider? tutorAvatar;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AuroraColors>()!;
    final typography = Theme.of(context).extension<AuroraTypography>()!;
    final density = Theme.of(context).extension<AuroraDensity>()!;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        AuroraAvatar(name: tutorName, image: tutorAvatar, size: AuroraAvatarSize.sm),
        SizedBox(width: 8 * density.spaceScale),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: colors.neutral100,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (var i = 0; i < 3; i++) ...[
                if (i > 0) const SizedBox(width: 4),
                _Dot(color: colors.neutral500),
              ],
              const SizedBox(width: 6),
              Text('typing…',
                  style: typography.bodySm
                      .copyWith(color: colors.neutral500),),
            ],
          ),
        ),
      ],
    );
  }
}

class _Dot extends StatelessWidget {
  const _Dot({required this.color});
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 6,
      height: 6,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
    );
  }
}
