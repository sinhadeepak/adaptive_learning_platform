// Sprint 8 F-5 — Stripe Checkout WebView.
//
// Loads the URL returned by /payment/checkout/session in a webview_flutter
// and watches navigation events for the success/cancel redirect URLs.
// When the redirect lands, the screen pops back to BillingScreen which
// then polls /payment/me until the webhook flips isPremium → true.

import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

class PaywallWebViewScreen extends StatefulWidget {
  const PaywallWebViewScreen({super.key, required this.checkoutUrl});

  /// Full URL from /payment/checkout/session — already includes the
  /// success_url + cancel_url query params Stripe redirects to.
  final String checkoutUrl;

  @override
  State<PaywallWebViewScreen> createState() => _PaywallWebViewScreenState();
}

/// Outcome the WebView pops with. BillingScreen looks at this to decide
/// whether to start the post-checkout poll loop.
enum CheckoutOutcome { success, cancelled, dismissed }

class _PaywallWebViewScreenState extends State<PaywallWebViewScreen> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (req) {
            final outcome = detectCheckoutOutcome(req.url);
            if (outcome != null) {
              if (mounted) Navigator.of(context).pop(outcome);
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
        ),
      )
      ..loadRequest(Uri.parse(widget.checkoutUrl));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Upgrade to Premium'),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => Navigator.of(context).pop(CheckoutOutcome.dismissed),
        ),
      ),
      body: WebViewWidget(controller: _controller),
    );
  }
}

/// Pure helper — picks the CheckoutOutcome from a redirect URL. Extracted
/// so unit tests can pin the contract without spinning up a WebView.
///
/// The success and cancel URLs come from PAYMENT_CHECKOUT_SUCCESS_URL /
/// PAYMENT_CHECKOUT_CANCEL_URL on the backend; both carry `status=success`
/// or `status=cancel` as query params, which is what we key off.
CheckoutOutcome? detectCheckoutOutcome(String url) {
  final uri = Uri.tryParse(url);
  if (uri == null) return null;
  final status = uri.queryParameters['status'];
  if (status == 'success') return CheckoutOutcome.success;
  if (status == 'cancel') return CheckoutOutcome.cancelled;
  return null;
}
