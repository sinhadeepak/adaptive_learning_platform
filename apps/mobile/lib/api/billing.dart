// Sprint 8 F-5 — Payment service mobile client.
//
// Mirrors the web shape in apps/web-student/src/lib/billing.ts so behaviour
// is consistent across surfaces. Pure functions live here so tests don't
// need to mock http/auth_client.

import 'dart:convert';

import '../auth/auth_client.dart';

class SubscriptionSummary {
  SubscriptionSummary({
    required this.tier,
    required this.status,
    required this.isPremium,
    this.periodEnd,
    this.cancelAtPeriodEnd = false,
  });

  final String tier; // STUDENT_FREE | STUDENT_PREMIUM
  final String status; // FSM state literal: ACTIVE / PAST_DUE / CANCELED / etc.
  final bool isPremium;
  final DateTime? periodEnd;
  final bool cancelAtPeriodEnd;

  factory SubscriptionSummary.fromJson(Map<String, dynamic> j) {
    final pe = j['periodEnd'] as String?;
    return SubscriptionSummary(
      tier: (j['tier'] ?? 'STUDENT_FREE') as String,
      status: (j['status'] ?? 'INACTIVE') as String,
      isPremium: (j['isPremium'] ?? false) as bool,
      periodEnd: pe == null ? null : DateTime.parse(pe),
      cancelAtPeriodEnd: (j['cancelAtPeriodEnd'] ?? false) as bool,
    );
  }
}

class CheckoutSession {
  CheckoutSession({required this.sessionId, required this.url, required this.stripeMode});
  final String sessionId;
  final String url;
  final String stripeMode; // live | stub

  factory CheckoutSession.fromJson(Map<String, dynamic> j) => CheckoutSession(
        sessionId: j['sessionId'] as String,
        url: j['url'] as String,
        stripeMode: (j['stripeMode'] ?? 'live') as String,
      );
}

class PremiumDisplay {
  PremiumDisplay({required this.label, required this.tone, this.caption});
  final String label;
  final PremiumTone tone;
  final String? caption;
}

enum PremiumTone { neutral, premium, warn }

/// Pure helper — derives the badge label + caption shown on Profile and
/// the BillingScreen from a /payment/me response. Mirrors the web
/// `premiumDisplay()` so the two surfaces show the same copy.
PremiumDisplay premiumDisplay(SubscriptionSummary? sub) {
  if (sub == null || !sub.isPremium) {
    return PremiumDisplay(
      label: 'Free',
      tone: PremiumTone.neutral,
      caption: 'Upgrade to unlock unlimited mocks + photo doubts.',
    );
  }
  if (sub.status == 'PAST_DUE') {
    return PremiumDisplay(
      label: 'Premium · Payment Issue',
      tone: PremiumTone.warn,
      caption:
          "We're retrying your payment. Premium features stay on for now.",
    );
  }
  if (sub.cancelAtPeriodEnd && sub.periodEnd != null) {
    return PremiumDisplay(
      label: 'Premium · Cancelling',
      tone: PremiumTone.warn,
      caption:
          'Cancels at end of cycle (${_formatDate(sub.periodEnd!)}). Reactivate any time before then.',
    );
  }
  return PremiumDisplay(
    label: 'Premium',
    tone: PremiumTone.premium,
    caption: sub.periodEnd != null
        ? 'Renews ${_formatDate(sub.periodEnd!)}'
        : null,
  );
}

String _formatDate(DateTime dt) {
  // Locale-free YYYY-MM-DD so the unit tests don't depend on host locale.
  final y = dt.year.toString().padLeft(4, '0');
  final m = dt.month.toString().padLeft(2, '0');
  final d = dt.day.toString().padLeft(2, '0');
  return '$y-$m-$d';
}

class BillingClient {
  BillingClient(this.auth);
  final AuthClient auth;

  Future<SubscriptionSummary> me() async {
    final r = await auth.apiGet('/payment/me');
    if (r.statusCode != 200) {
      throw Exception('Failed to load subscription (${r.statusCode})');
    }
    return SubscriptionSummary.fromJson(
      jsonDecode(r.body) as Map<String, dynamic>,
    );
  }

  Future<CheckoutSession> startCheckout({String plan = 'premium_monthly'}) async {
    final r = await auth.apiPost('/payment/checkout/session', {'plan': plan});
    if (r.statusCode != 200) {
      throw Exception('Checkout failed (${r.statusCode})');
    }
    return CheckoutSession.fromJson(
      jsonDecode(r.body) as Map<String, dynamic>,
    );
  }
}
