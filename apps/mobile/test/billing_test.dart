// Sprint 8 F-5 — pure-logic mobile billing tests.
//
// Two contracts pinned here:
//  1. premiumDisplay() — the {label, tone, caption} shape rendered by
//     BillingScreen + the Subscription pill on Profile. Mirrors the
//     web `premiumDisplay()` so copy stays consistent across surfaces.
//  2. detectCheckoutOutcome() — the URL-matching the WebView delegate
//     uses to pop with success/cancel. Brittle without a test because
//     PAYMENT_CHECKOUT_SUCCESS_URL/CANCEL_URL drift would silently
//     break the redirect-back flow.

import 'package:flutter_test/flutter_test.dart';

import 'package:adaptive_learning_mobile/api/billing.dart';
import 'package:adaptive_learning_mobile/screens/paywall_webview_screen.dart';

SubscriptionSummary _sub({
  String tier = 'STUDENT_FREE',
  String status = 'INACTIVE',
  bool isPremium = false,
  DateTime? periodEnd,
  bool cancelAtPeriodEnd = false,
}) {
  return SubscriptionSummary(
    tier: tier,
    status: status,
    isPremium: isPremium,
    periodEnd: periodEnd,
    cancelAtPeriodEnd: cancelAtPeriodEnd,
  );
}

void main() {
  group('premiumDisplay', () {
    test('null sub → free + upsell caption', () {
      final d = premiumDisplay(null);
      expect(d.label, 'Free');
      expect(d.tone, PremiumTone.neutral);
      expect(d.caption, contains('Upgrade'));
    });

    test('not premium → free + upsell caption', () {
      final d = premiumDisplay(_sub());
      expect(d.label, 'Free');
      expect(d.tone, PremiumTone.neutral);
    });

    test('active premium → Premium label + renewal caption', () {
      final d = premiumDisplay(_sub(
        tier: 'STUDENT_PREMIUM',
        status: 'ACTIVE',
        isPremium: true,
        periodEnd: DateTime.utc(2026, 12, 1),
      ));
      expect(d.label, 'Premium');
      expect(d.tone, PremiumTone.premium);
      expect(d.caption, isNotNull);
      expect(d.caption!, contains('Renews'));
      expect(d.caption!, contains('2026-12-01'));
    });

    test('PAST_DUE retains Premium pill but signals payment issue', () {
      final d = premiumDisplay(_sub(
        tier: 'STUDENT_PREMIUM',
        status: 'PAST_DUE',
        isPremium: true,
        periodEnd: DateTime.utc(2026, 6, 1),
      ));
      expect(d.label, contains('Payment Issue'));
      expect(d.tone, PremiumTone.warn);
    });

    test('CANCELED with future period_end → Cancelling pill', () {
      final d = premiumDisplay(_sub(
        tier: 'STUDENT_PREMIUM',
        status: 'CANCELED',
        isPremium: true,
        periodEnd: DateTime.utc(2026, 6, 1),
        cancelAtPeriodEnd: true,
      ));
      expect(d.label, contains('Cancelling'));
      expect(d.tone, PremiumTone.warn);
      expect(d.caption!, contains('Reactivate'));
    });

    test('active premium without period_end → Premium without caption', () {
      final d = premiumDisplay(_sub(
        tier: 'STUDENT_PREMIUM',
        status: 'ACTIVE',
        isPremium: true,
        periodEnd: null,
      ));
      expect(d.label, 'Premium');
      expect(d.caption, isNull);
    });
  });

  group('SubscriptionSummary.fromJson', () {
    test('parses backend shape with non-null period_end', () {
      final s = SubscriptionSummary.fromJson({
        'tier': 'STUDENT_PREMIUM',
        'status': 'ACTIVE',
        'isPremium': true,
        'periodEnd': '2026-08-15T12:00:00Z',
        'cancelAtPeriodEnd': false,
      });
      expect(s.isPremium, isTrue);
      expect(s.periodEnd, DateTime.utc(2026, 8, 15, 12, 0));
    });

    test('parses inactive payload with null period_end', () {
      final s = SubscriptionSummary.fromJson({
        'tier': 'STUDENT_FREE',
        'status': 'INACTIVE',
        'isPremium': false,
        'periodEnd': null,
        'cancelAtPeriodEnd': false,
      });
      expect(s.isPremium, isFalse);
      expect(s.periodEnd, isNull);
    });
  });

  group('detectCheckoutOutcome', () {
    test('status=success → CheckoutOutcome.success', () {
      final o = detectCheckoutOutcome(
          'http://localhost:35173/billing?status=success&session_id=cs_123');
      expect(o, CheckoutOutcome.success);
    });

    test('status=cancel → CheckoutOutcome.cancelled', () {
      final o = detectCheckoutOutcome(
          'http://localhost:35173/billing?status=cancel');
      expect(o, CheckoutOutcome.cancelled);
    });

    test('intermediate Stripe-hosted URL → null (keep navigating)', () {
      // The Stripe Checkout flow lands on stripe.com pages first.
      // Those are NOT terminal — the WebView must keep navigating.
      final o = detectCheckoutOutcome('https://checkout.stripe.com/c/pay/cs_test_a1b2');
      expect(o, isNull);
    });

    test('garbage URL → null', () {
      expect(detectCheckoutOutcome(''), isNull);
    });

    test('https success URL also matches (real Stripe)', () {
      // In production, success_url points at the public web-student domain.
      final o = detectCheckoutOutcome(
          'https://app.adaptivelearn.in/billing?status=success&session_id=cs_live_xyz');
      expect(o, CheckoutOutcome.success);
    });

    test('non-billing path with status=success still matches', () {
      // Defensive: any redirect carrying status=success counts as success.
      // Stripe sometimes appends additional params; we don't pin path.
      final o = detectCheckoutOutcome('http://localhost:35173/x?status=success');
      expect(o, CheckoutOutcome.success);
    });
  });
}
