// Sprint 8 F-5 — Mobile billing screen.
//
// Mirrors apps/web-student/src/pages/Billing.tsx:
//  - Loads /payment/me on mount.
//  - Shows current tier + caption derived by `premiumDisplay()`.
//  - Free tier → "Upgrade to Premium" CTA opens PaywallWebViewScreen with
//    the URL from /payment/checkout/session.
//  - On CheckoutOutcome.success, polls /payment/me until isPremium flips
//    on (max 30s) so the user sees the elevation immediately even though
//    it's driven by the webhook → NATS → Auth chain.

import 'dart:async';

import 'package:flutter/material.dart';

import '../api/billing.dart';
import 'paywall_webview_screen.dart';

class BillingScreen extends StatefulWidget {
  const BillingScreen({super.key, required this.client});
  final BillingClient client;

  @override
  State<BillingScreen> createState() => _BillingScreenState();
}

class _BillingScreenState extends State<BillingScreen> {
  SubscriptionSummary? _sub;
  bool _loading = true;
  bool _starting = false;
  String? _error;
  String? _banner;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final s = await widget.client.me();
      if (!mounted) return;
      setState(() {
        _sub = s;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Could not load subscription: $e';
      });
    }
  }

  Future<void> _upgrade() async {
    setState(() {
      _starting = true;
      _error = null;
    });
    try {
      final session = await widget.client.startCheckout();
      if (!mounted) return;
      final outcome = await Navigator.of(context).push<CheckoutOutcome>(
        MaterialPageRoute(
          builder: (_) => PaywallWebViewScreen(checkoutUrl: session.url),
        ),
      );
      if (!mounted) return;
      if (outcome == CheckoutOutcome.success) {
        setState(() => _banner = 'Confirming your subscription with Stripe…');
        await _pollUntilPremium();
      } else if (outcome == CheckoutOutcome.cancelled) {
        setState(() => _banner = 'Checkout cancelled — no charge made.');
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = 'Checkout failed: $e');
    } finally {
      if (mounted) setState(() => _starting = false);
    }
  }

  /// Poll /payment/me up to 30s waiting for the elevated tier to land.
  Future<void> _pollUntilPremium() async {
    const total = Duration(seconds: 30);
    const step = Duration(milliseconds: 1500);
    final deadline = DateTime.now().add(total);
    while (DateTime.now().isBefore(deadline)) {
      try {
        final s = await widget.client.me();
        if (!mounted) return;
        setState(() => _sub = s);
        if (s.isPremium) {
          setState(() => _banner = 'Welcome to Premium! Your account is active.');
          return;
        }
      } catch (_) {
        // best-effort poll; swallow transient errors and try again
      }
      await Future.delayed(step);
    }
    if (mounted) {
      setState(() => _banner =
          'Payment received. Account elevation is taking longer than usual — pull to refresh in a minute.',);
    }
  }

  @override
  Widget build(BuildContext context) {
    final display = premiumDisplay(_sub);
    return Scaffold(
      appBar: AppBar(title: const Text('Billing & Subscription')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (_banner != null) _bannerWidget(_banner!),
            if (_error != null) _bannerWidget(_error!, error: true),
            if (_loading)
              const Center(child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator()))
            else
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Current plan',
                              style: TextStyle(fontWeight: FontWeight.w600),),
                          _pill(display),
                        ],
                      ),
                      if (display.caption != null) ...[
                        const SizedBox(height: 8),
                        Text(display.caption!,
                            style: const TextStyle(color: Colors.black54),),
                      ],
                      if (_sub?.periodEnd != null) ...[
                        const SizedBox(height: 12),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text('Renewal date'),
                            Text(_sub!.periodEnd!.toIso8601String().substring(0, 10)),
                          ],
                        ),
                      ],
                      if (_sub?.isPremium != true) ...[
                        const SizedBox(height: 16),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton(
                            onPressed: _starting ? null : _upgrade,
                            child: Text(_starting ? 'Redirecting…' : 'Upgrade to Premium'),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _bannerWidget(String text, {bool error = false}) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: error ? Colors.red.shade50 : Colors.blue.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
            color: error ? Colors.red.shade200 : Colors.blue.shade200,),
      ),
      child: Text(text,
          style: TextStyle(color: error ? Colors.red.shade900 : Colors.blue.shade900),),
    );
  }

  Widget _pill(PremiumDisplay d) {
    final (bg, fg) = switch (d.tone) {
      PremiumTone.premium => (Colors.amber.shade100, Colors.amber.shade900),
      PremiumTone.warn => (Colors.orange.shade100, Colors.orange.shade900),
      PremiumTone.neutral => (Colors.grey.shade200, Colors.grey.shade800),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(d.label,
          style: TextStyle(color: fg, fontWeight: FontWeight.w600, fontSize: 12),),
    );
  }
}
