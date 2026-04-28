/// Tests for `buildTutorMessages` (S7) — the message-array builder behind
/// the multi-turn AI tutor on doubt detail screens.
///
/// Three correctness properties this guards:
///  1. Chronological ordering — answers sort by createdAt ASC regardless
///     of input order, so the model sees the dialog in the right sequence.
///  2. Role mapping — peer (student follow-up) → user; ai/expert → assistant.
///     A regression that mis-roles peer answers as assistant would make the
///     model think the user already explained, breaking continuity.
///  3. Follow-up nudge — when the last turn is from an assistant, append a
///     "can you explain further" user turn so the next stream is a real
///     continuation, not a re-do of the first reply.

import 'package:flutter_test/flutter_test.dart';
import 'package:adaptive_learning_mobile/api/api_client.dart';
import 'package:adaptive_learning_mobile/screens/doubt_detail_screen.dart';

DoubtAnswer _ans({
  required String content,
  required String source, // 'peer' | 'ai' | 'expert'
  required String createdAt,
  String role = 'STUDENT',
}) {
  return DoubtAnswer(
    id: 'a-${content.hashCode}',
    doubtId: 'd-1',
    content: content,
    source: source,
    authorRole: role,
    createdAt: createdAt,
    accepted: false,
  );
}

void main() {
  group('buildTutorMessages', () {
    test('empty answers → just the question as a user turn', () {
      final out = buildTutorMessages(
        questionText: 'What is acceleration?',
        answers: const [],
      );
      expect(out, hasLength(1));
      expect(out[0].role, 'user');
      expect(out[0].content, 'What is acceleration?');
    });

    test('single AI answer → user / assistant + appended nudge', () {
      final out = buildTutorMessages(
        questionText: 'What is acceleration?',
        answers: [
          _ans(
            content: 'Acceleration is rate of change of velocity.',
            source: 'ai',
            createdAt: '2026-04-27T10:00:00Z',
          ),
        ],
      );
      expect(out, hasLength(3));
      expect(out[0].role, 'user');
      expect(out[1].role, 'assistant');
      expect(out[1].content, 'Acceleration is rate of change of velocity.');
      // Nudge appended because the last real turn was from the assistant.
      expect(out[2].role, 'user');
      expect(out[2].content, contains('explain'));
    });

    test('peer answers map to user role', () {
      final out = buildTutorMessages(
        questionText: 'Q?',
        answers: [
          _ans(content: 'AI reply', source: 'ai', createdAt: '2026-04-27T10:00:00Z'),
          _ans(content: 'Student follow-up', source: 'peer', createdAt: '2026-04-27T10:05:00Z'),
        ],
      );
      // Question(user) + AI(assistant) + peer(user). No nudge because last
      // turn is already a user follow-up.
      expect(out, hasLength(3));
      expect(out[0].role, 'user');
      expect(out[1].role, 'assistant');
      expect(out[2].role, 'user');
      expect(out[2].content, 'Student follow-up');
    });

    test('expert answers map to assistant role (same as ai)', () {
      final out = buildTutorMessages(
        questionText: 'Q?',
        answers: [
          _ans(
            content: 'Teacher explanation',
            source: 'expert',
            createdAt: '2026-04-27T10:00:00Z',
          ),
        ],
      );
      // 3 entries: user(Q) + assistant(expert reply) + user(nudge appended).
      expect(out, hasLength(3));
      expect(out[1].role, 'assistant');
    });

    test('answers sort chronologically regardless of input order', () {
      final out = buildTutorMessages(
        questionText: 'Q?',
        answers: [
          _ans(content: 'third', source: 'peer', createdAt: '2026-04-27T12:00:00Z'),
          _ans(content: 'first', source: 'ai', createdAt: '2026-04-27T10:00:00Z'),
          _ans(content: 'second', source: 'peer', createdAt: '2026-04-27T11:00:00Z'),
        ],
      );
      // user(Q) + assistant(first) + user(second) + user(third). No nudge
      // because last is already a user.
      expect(out.map((m) => m.content).toList(), [
        'Q?',
        'first',
        'second',
        'third',
      ]);
    });

    test('nudge fires when last answer is ai/expert (assistant role)', () {
      final aiLast = buildTutorMessages(
        questionText: 'Q?',
        answers: [
          _ans(content: 'student', source: 'peer', createdAt: '2026-04-27T10:00:00Z'),
          _ans(content: 'ai', source: 'ai', createdAt: '2026-04-27T11:00:00Z'),
        ],
      );
      expect(aiLast.last.role, 'user');
      expect(aiLast.last.content, contains('explain'));
    });

    test('nudge does NOT fire when last answer is peer (already user role)', () {
      final peerLast = buildTutorMessages(
        questionText: 'Q?',
        answers: [
          _ans(content: 'ai', source: 'ai', createdAt: '2026-04-27T10:00:00Z'),
          _ans(content: 'peer follow', source: 'peer', createdAt: '2026-04-27T11:00:00Z'),
        ],
      );
      // user(Q) + assistant(ai) + user(peer). Last is already user.
      expect(peerLast, hasLength(3));
      expect(peerLast.last.content, 'peer follow');
    });

    test('nudge does NOT fire when there are zero answers', () {
      final out = buildTutorMessages(questionText: 'Q?', answers: const []);
      expect(out, hasLength(1));
      // No nudge — the messages.length > 1 guard skips it.
    });

    test('nudge appended only once even when assistant turn comes last', () {
      // Two assistant turns in a row would still get one nudge appended.
      final out = buildTutorMessages(
        questionText: 'Q?',
        answers: [
          _ans(content: 'ai-1', source: 'ai', createdAt: '2026-04-27T10:00:00Z'),
          _ans(content: 'ai-2', source: 'ai', createdAt: '2026-04-27T11:00:00Z'),
        ],
      );
      // user + assistant + assistant + user(nudge). Single nudge appended.
      expect(out, hasLength(4));
      final userTurns = out.where((m) => m.role == 'user').length;
      expect(userTurns, 2); // original question + nudge
    });
  });
}
