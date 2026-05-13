// Student's purchases — mirrors web-student/src/pages/MyPurchases.tsx.

import 'package:flutter/material.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';

import '../../api/marketplace.dart';
import '../../widgets/alp_card.dart';
import 'courses_screen.dart';

class MyPurchasesScreen extends StatefulWidget {
  const MyPurchasesScreen({super.key, required this.client});
  final MarketplaceClient client;

  @override
  State<MyPurchasesScreen> createState() => _MyPurchasesScreenState();
}

class _MyPurchasesScreenState extends State<MyPurchasesScreen> {
  List<Purchase>? _items;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _error = null;
      _items = null;
    });
    try {
      final r = await widget.client.myPurchases();
      if (!mounted) return;
      setState(() => _items = r);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    }
  }

  String _rupees(int paise) => '₹${(paise / 100).toStringAsFixed(0)}';

  Color _statusColor(String s) {
    switch (s) {
      case 'PAID':
        return AlpColors.colorGreen;
      case 'PENDING_PAYMENT':
        return AlpColors.colorAmber;
      case 'REFUNDED':
        return AlpColors.textMuted;
      default:
        return AlpColors.colorRed;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AlpColors.bgBase,
      appBar: AppBar(title: const Text('My purchases')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextButton.icon(
              icon: const Icon(Icons.menu_book,
                  size: 16, color: AlpColors.colorBlue,),
              label: const Text('Browse more courses',
                  style: TextStyle(color: AlpColors.colorBlue),),
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(
                    builder: (_) => CoursesScreen(client: widget.client),),
              ),
            ),
            if (_error != null)
              Container(
                margin: const EdgeInsets.only(top: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0x33F43F5E),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(_error!,
                    style: const TextStyle(
                        color: AlpColors.colorRed, fontSize: 13,),),
              )
            else if (_items == null)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (_items!.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Text('No purchases yet.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: AlpColors.textMuted),),
              )
            else
              ..._items!.map((p) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: AlpCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Expanded(
                                child: Text(
                                  'Course ${p.courseId.substring(0, 8)}…',
                                  style: const TextStyle(
                                      color: AlpColors.textPrimary,
                                      fontWeight: FontWeight.bold,),
                                ),
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 8, vertical: 2,),
                                decoration: BoxDecoration(
                                  color: _statusColor(p.status),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: Text(
                                  p.status,
                                  style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 11,
                                      fontWeight: FontWeight.bold,),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(_rupees(p.pricePaise),
                              style: const TextStyle(
                                  color: AlpColors.textMuted, fontSize: 13,),),
                        ],
                      ),
                    ),
                  ),),
          ],
        ),
      ),
    );
  }
}
