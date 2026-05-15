// Tutor public profile + booking flow.

import 'package:flutter/material.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';
import '../../aurora/widgets/widgets.dart';

import '../../api/marketplace.dart';
import '../../widgets/alp_card.dart';
import 'my_bookings_screen.dart';

const _days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

class TutorDetailScreen extends StatefulWidget {
  const TutorDetailScreen({
    super.key,
    required this.client,
    required this.userId,
  });
  final MarketplaceClient client;
  final String userId;

  @override
  State<TutorDetailScreen> createState() => _TutorDetailScreenState();
}

class _TutorDetailScreenState extends State<TutorDetailScreen> {
  TutorPublicProfile? _profile;
  String? _error;
  DateTime _date = DateTime.now().add(const Duration(days: 1));
  List<AvailabilitySlot> _slots = [];
  bool _booking = false;

  @override
  void initState() {
    super.initState();
    _loadProfile();
    _loadSlots();
  }

  Future<void> _loadProfile() async {
    try {
      final p = await widget.client.getTutor(widget.userId);
      if (!mounted) return;
      setState(() => _profile = p);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    }
  }

  Future<void> _loadSlots() async {
    final iso = _date.toIso8601String().substring(0, 10);
    try {
      final s = await widget.client.availability(widget.userId, iso);
      if (!mounted) return;
      setState(() => _slots = s);
    } catch (_) {
      if (!mounted) return;
      setState(() => _slots = const []);
    }
  }

  String _rupees(int paise) => '₹${(paise / 100).toStringAsFixed(0)}';

  Future<void> _bookSlot(AvailabilitySlot s) async {
    if (_profile == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirm booking?'),
        content: Text(
          'You will be charged ${_rupees(_profile!.hourlyRatePaise)} for this 60-minute session.',
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel'),),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Book'),),
        ],
      ),
    );
    if (ok != true) return;
    setState(() {
      _booking = true;
      _error = null;
    });
    try {
      final start = DateTime.parse(s.slotStart);
      final end = start.add(const Duration(hours: 1));
      final b = await widget.client.createBooking(
        tutorUserId: widget.userId,
        slotStart: s.slotStart,
        slotEnd: end.toUtc().toIso8601String(),
      );
      await widget.client.confirmPayment(b.id);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(
            builder: (_) => MyBookingsScreen(client: widget.client),),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _booking = false);
    }
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 30)),
    );
    if (picked != null && picked != _date) {
      setState(() => _date = picked);
      _loadSlots();
    }
  }

  String _hhmm(int minutes) {
    final h = (minutes ~/ 60).toString().padLeft(2, '0');
    final m = (minutes % 60).toString().padLeft(2, '0');
    return '$h:$m';
  }

  @override
  Widget build(BuildContext context) {
    final p = _profile;
    return AuroraScaffold(
      appBar: AuroraAppBar(title: p?.displayName ?? 'Tutor'),
      body: p == null
          ? Center(
              child: _error != null
                  ? Padding(
                      padding: const EdgeInsets.all(16),
                      child: Text(_error!,
                          style: const TextStyle(color: AlpColors.colorRed),),)
                  : const AuroraSpinner(size: 32),
            )
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Text(p.headline,
                    style: const TextStyle(
                        color: AlpColors.textMuted, fontSize: 14,),),
                const SizedBox(height: 12),
                AlpCard(
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Hourly rate',
                          style: TextStyle(
                              color: AlpColors.textMuted, fontSize: 13,),),
                      Text(
                        '${_rupees(p.hourlyRatePaise)} /hr',
                        style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,),
                      ),
                    ],
                  ),
                ),
                if (p.bio.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  AlpCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('About',
                            style: TextStyle(
                                fontWeight: FontWeight.bold,),),
                        const SizedBox(height: 6),
                        Text(p.bio,
                            style: const TextStyle(
                                color: AlpColors.textSecondary, fontSize: 13,),),
                      ],
                    ),
                  ),
                ],
                if (p.qualifications.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  AlpCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Qualifications',
                            style: TextStyle(
                                fontWeight: FontWeight.bold,),),
                        const SizedBox(height: 6),
                        ...p.qualifications.map((q) => Padding(
                              padding: const EdgeInsets.symmetric(vertical: 2),
                              child: RichText(
                                text: TextSpan(
                                  style: const TextStyle(
                                      color: AlpColors.textSecondary,
                                      fontSize: 13,),
                                  children: [
                                    TextSpan(
                                        text: q.title,
                                        style: const TextStyle(
                                            fontWeight: FontWeight.bold,),),
                                    if (q.institution != null)
                                      TextSpan(text: ' — ${q.institution}'),
                                    if (q.yearCompleted != null)
                                      TextSpan(text: ' (${q.yearCompleted})'),
                                  ],
                                ),
                              ),
                            ),),
                      ],
                    ),
                  ),
                ],
                if (p.availability.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  AlpCard(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('Weekly availability',
                            style: TextStyle(
                                fontWeight: FontWeight.bold,),),
                        const SizedBox(height: 6),
                        ...p.availability.map((a) => Text(
                              '${_days[a.dayOfWeek]}  ${_hhmm(a.startMinute)} – ${_hhmm(a.endMinute)}',
                              style: const TextStyle(
                                  color: AlpColors.textSecondary, fontSize: 13,),
                            ),),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 16),
                AlpCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('Book a session',
                              style: TextStyle(
                                  fontWeight: FontWeight.bold,),),
                          TextButton.icon(
                            onPressed: _pickDate,
                            icon: const Icon(Icons.calendar_today,
                                size: 14, color: AlpColors.colorBlue,),
                            label: Text(
                              '${_date.year}-${_date.month.toString().padLeft(2, '0')}-${_date.day.toString().padLeft(2, '0')}',
                              style: const TextStyle(
                                  color: AlpColors.colorBlue, fontSize: 13,),
                            ),
                          ),
                        ],
                      ),
                      if (_error != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(_error!,
                              style: const TextStyle(
                                  color: AlpColors.colorRed, fontSize: 12,),),
                        ),
                      const SizedBox(height: 8),
                      if (_slots.isEmpty)
                        const Text('No open slots on this date.',
                            style: TextStyle(
                                color: AlpColors.textMuted, fontSize: 13,),)
                      else
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: _slots.map((s) {
                            final start = DateTime.parse(s.slotStart);
                            final h =
                                start.toLocal().hour.toString().padLeft(2, '0');
                            final m = start
                                .toLocal()
                                .minute
                                .toString()
                                .padLeft(2, '0');
                            return ElevatedButton(
                              style: ElevatedButton.styleFrom(
                                foregroundColor:
                                    Theme.of(context).colorScheme.onSurface,
                              ),
                              onPressed: _booking ? null : () => _bookSlot(s),
                              child: Text('$h:$m'),
                            );
                          }).toList(),
                        ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }
}
