// Regression coverage for `User.copyWith` — Phase 3c.full v3 final polish.
//
// Pre-v3.v1 the `User` class had `copyWith` overloads that silently
// dropped fields the caller didn't pass through. That bug shipped twice
// in a row (`tenantId` first, then `examId`) because there was no
// compile-time link between "fields on User" and "fields preserved by
// copyWith". This test plugs that hole *socially* rather than
// structurally: every current User field is set to a non-default
// sentinel here, a single field is mutated via copyWith, and every
// other field is asserted to have survived.
//
// When you add a new field to `User`:
//   1. Add it to `copyWith` (in `lib/auth/auth_client.dart`).
//   2. Add a non-default value here in the constructor AND an
//      assertion below.
//
// Failing to do step 1 means partial copyWith calls silently drop the
// new field — this test is here because exactly that happened with
// `tenantId` and `examId` pre-v3.v1.

import 'package:flutter_test/flutter_test.dart';

import 'package:adaptive_learning_mobile/auth/auth_client.dart';

void main() {
  group('User.copyWith', () {
    test('preserves every unchanged field on partial copy', () {
      // Build a User with EVERY field set to a non-default sentinel
      // so an accidental drop-to-default (null, '', etc.) cannot
      // pass an equality check by coincidence.
      final original = User(
        id: 'id-x',
        email: 'e@x.test',
        firstName: 'F',
        lastName: 'L',
        role: 'STUDENT',
        onboardingState: 'ONBOARDED',
        tenantId: 't-1',
        examId: 'ex-1',
      );

      // Mutate ONE field. Everything else must be preserved.
      final copied = original.copyWith(firstName: 'NEW');

      // Mutated field changed:
      expect(copied.firstName, 'NEW');

      // Every other current User field preserved:
      expect(copied.id, 'id-x');
      expect(copied.email, 'e@x.test');
      expect(copied.lastName, 'L');
      expect(copied.role, 'STUDENT');
      expect(copied.onboardingState, 'ONBOARDED');
      expect(copied.tenantId, 't-1');
      expect(copied.examId, 'ex-1');
    });

    test('preserves examId when copying with only lastName', () {
      // Targeted regression for the pre-v3.v1 bug: a name edit must
      // not wipe examId.
      final original = User(
        id: 'id-x',
        email: 'e@x.test',
        firstName: 'F',
        lastName: 'L',
        role: 'STUDENT',
        onboardingState: 'ONBOARDED',
        tenantId: 't-1',
        examId: 'ex-1',
      );

      final copied = original.copyWith(lastName: 'NEW');

      expect(copied.lastName, 'NEW');
      expect(copied.examId, 'ex-1');
      expect(copied.tenantId, 't-1');
    });

    test('preserves tenantId when copying with only onboardingState', () {
      // Targeted regression for the original tenantId drop.
      final original = User(
        id: 'id-x',
        email: 'e@x.test',
        firstName: 'F',
        lastName: 'L',
        role: 'STUDENT',
        onboardingState: 'PENDING',
        tenantId: 't-1',
        examId: 'ex-1',
      );

      final copied = original.copyWith(onboardingState: 'ONBOARDED');

      expect(copied.onboardingState, 'ONBOARDED');
      expect(copied.tenantId, 't-1');
      expect(copied.examId, 'ex-1');
    });

    test('preserves all fields when copying with examId only', () {
      final original = User(
        id: 'id-x',
        email: 'e@x.test',
        firstName: 'F',
        lastName: 'L',
        role: 'STUDENT',
        onboardingState: 'ONBOARDED',
        tenantId: 't-1',
        examId: null,
      );

      final copied = original.copyWith(examId: 'ex-2');

      expect(copied.examId, 'ex-2');
      expect(copied.id, 'id-x');
      expect(copied.email, 'e@x.test');
      expect(copied.firstName, 'F');
      expect(copied.lastName, 'L');
      expect(copied.role, 'STUDENT');
      expect(copied.onboardingState, 'ONBOARDED');
      expect(copied.tenantId, 't-1');
    });
  });
}
