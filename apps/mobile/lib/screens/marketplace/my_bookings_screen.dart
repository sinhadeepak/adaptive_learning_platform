// Student's bookings list — mirrors web-student/src/pages/MyBookings.tsx.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';
import '../../aurora/widgets/widgets.dart';

import '../../api/marketplace.dart';
import '../../widgets/alp_card.dart';
import 'tutors_screen.dart';

class MyBookingsScreen extends StatefulWidget {
  const MyBookingsScreen({super.key, required this.client});
  final MarketplaceClient client;

  @override
  State<MyBookingsScreen> createState() => _MyBookingsScreenState();
}

class _MyBookingsScreenState extends State<MyBookingsScreen> {
  List<Booking>? _items;
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
      final r = await widget.client.myBookings();
      if (!mounted) return;
      setState(() => _items = r);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    }
  }

  Future<void> _cancel(Booking b) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Cancel this booking?'),
        content:
            const Text('Cancellations within 24h of the slot are not allowed.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Keep'),),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Cancel'),),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await widget.client.cancel(b.id);
      _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  String _rupees(int paise) => '₹${(paise / 100).toStringAsFixed(0)}';

  Color _statusColor(String s) {
    switch (s) {
      case 'CONFIRMED':
        return AlpColors.colorBlue;
      case 'IN_PROGRESS':
        return AlpColors.colorGreen;
      case 'COMPLETED':
        return AlpColors.textMuted;
      case 'PENDING_PAYMENT':
        return AlpColors.colorAmber;
      default:
        return AlpColors.colorRed;
    }
  }

  String _statusLabel(String s) {
    switch (s) {
      case 'PENDING_PAYMENT':
        return 'Pending payment';
      case 'IN_PROGRESS':
        return 'In progress';
      case 'CANCELLED_BY_STUDENT':
        return 'Cancelled (you)';
      case 'CANCELLED_BY_TUTOR':
        return 'Cancelled (tutor)';
      case 'NO_SHOW_STUDENT':
        return 'No-show (you)';
      case 'NO_SHOW_TUTOR':
        return 'No-show (tutor)';
      default:
        final lower = s.toLowerCase().replaceAll('_', ' ');
        return lower[0].toUpperCase() + lower.substring(1);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuroraScaffold(
      appBar: AuroraAppBar(title: 'My bookings'),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextButton.icon(
              icon: const Icon(Icons.search,
                  size: 16, color: AlpColors.colorBlue,),
              label: const Text('Find a tutor',
                  style: TextStyle(color: AlpColors.colorBlue),),
              onPressed: () => Navigator.of(context).push(
                MaterialPageRoute(
                    builder: (_) => TutorsScreen(client: widget.client),),
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
                child: Center(child: AuroraSpinner(size: 32)),
              )
            else if (_items!.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Text('No bookings yet.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: AlpColors.textMuted),),
              )
            else
              ..._items!.map((b) {
                final start = DateTime.parse(b.slotStart).toLocal();
                final end = DateTime.parse(b.slotEnd).toLocal();
                final mins = end.difference(start).inMinutes;
                return Padding(
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
                                '${start.year}-${start.month.toString().padLeft(2, '0')}-${start.day.toString().padLeft(2, '0')}'
                                ' ${start.hour.toString().padLeft(2, '0')}:${start.minute.toString().padLeft(2, '0')}',
                                style: const TextStyle(
                                    fontWeight: FontWeight.bold,),
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 2,),
                              decoration: BoxDecoration(
                                color: _statusColor(b.status),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                _statusLabel(b.status),
                                style: const TextStyle(
                                    color: Colors.white,
                                    fontSize: 11,
                                    fontWeight: FontWeight.bold,),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(
                          'Tutor ${b.tutorUserId.substring(0, 8)}… · ${_rupees(b.pricePaise)} · $mins min',
                          style: const TextStyle(
                              color: AlpColors.textMuted, fontSize: 12,),
                        ),
                        if (b.status == 'IN_PROGRESS' &&
                            b.dailyRoomUrl != null) ...[
                          const SizedBox(height: 8),
                          OutlinedButton.icon(
                            icon: const Icon(Icons.video_call,
                                color: AlpColors.colorGreen,),
                            label: const Text('Copy session link',
                                style: TextStyle(color: AlpColors.colorGreen),),
                            onPressed: () async {
                              await Clipboard.setData(
                                  ClipboardData(text: b.dailyRoomUrl!),);
                              if (!context.mounted) return;
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                    content: Text(
                                        'Session link copied — open it in your browser.',),),
                              );
                            },
                          ),
                        ],
                        if (b.status == 'PENDING_PAYMENT' ||
                            b.status == 'CONFIRMED') ...[
                          const SizedBox(height: 8),
                          TextButton(
                            onPressed: () => _cancel(b),
                            child: const Text('Cancel',
                                style: TextStyle(color: AlpColors.colorRed),),
                          ),
                        ],
                      ],
                    ),
                  ),
                );
              }),
          ],
        ),
      ),
    );
  }
}
