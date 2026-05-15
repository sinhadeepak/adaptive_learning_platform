// Public tutor listing — mirrors web-student/src/pages/Tutors.tsx.
// Card grid with circular avatar, headline, rate + rating row.

import 'package:flutter/material.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';
import '../../aurora/widgets/widgets.dart';

import '../../api/marketplace.dart';
import '../../widgets/alp_card.dart';
import 'tutor_detail_screen.dart';

class TutorsScreen extends StatefulWidget {
  const TutorsScreen({super.key, required this.client});
  final MarketplaceClient client;

  @override
  State<TutorsScreen> createState() => _TutorsScreenState();
}

class _TutorsScreenState extends State<TutorsScreen> {
  List<TutorListingItem>? _items;
  String? _error;
  int _maxRateRupees = 5000;

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
      final items =
          await widget.client.listTutors(maxHourlyPaise: _maxRateRupees * 100);
      if (!mounted) return;
      setState(() => _items = items);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    }
  }

  String _rupees(int paise) => '₹${(paise / 100).toStringAsFixed(0)}';

  @override
  Widget build(BuildContext context) {
    return AuroraScaffold(
      appBar: AuroraAppBar(title: 'Find a tutor'),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              'Browse active tutors. Tap a card to see qualifications, '
              'weekly availability, and book a 1:1 session.',
              style: const TextStyle(color: AlpColors.textMuted, fontSize: 13),
            ),
            const SizedBox(height: 16),
            _RateFilter(
              valueRupees: _maxRateRupees,
              onChanged: (v) {
                setState(() => _maxRateRupees = v);
                _load();
              },
            ),
            const SizedBox(height: 16),
            if (_error != null)
              _Banner(text: _error!, isError: true)
            else if (_items == null)
              const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: AuroraSpinner(size: 32)),
              )
            else if (_items!.isEmpty)
              const Text(
                'No active tutors matching your filters.',
                style: TextStyle(color: AlpColors.textMuted),
              )
            else
              ..._items!.map((t) => _TutorCard(
                    tutor: t,
                    rupees: _rupees,
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => TutorDetailScreen(
                          client: widget.client,
                          userId: t.userId,
                        ),
                      ),
                    ),
                  ),),
          ],
        ),
      ),
    );
  }
}

class _RateFilter extends StatelessWidget {
  const _RateFilter({required this.valueRupees, required this.onChanged});
  final int valueRupees;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    return AlpCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Max hourly rate',
                style: TextStyle(color: AlpColors.textSecondary, fontSize: 13),
              ),
              Text(
                '₹$valueRupees',
                style: const TextStyle(
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          Slider(
            min: 100,
            max: 5000,
            divisions: 49,
            value: valueRupees.toDouble(),
            onChanged: (v) => onChanged(v.round()),
            activeColor: AlpColors.colorBlue,
          ),
        ],
      ),
    );
  }
}

const _avatarTints = <Color>[
  Color(0xFF4F87F6),
  Color(0xFF8B5CF6),
  Color(0xFF10C47A),
  Color(0xFFFB923C),
  Color(0xFFF43F5E),
  Color(0xFF06B6D4),
];

Color _tintFor(String seed) {
  var h = 0;
  for (final c in seed.codeUnits) {
    h = (h * 31 + c) & 0x7fffffff;
  }
  return _avatarTints[h % _avatarTints.length];
}

class _TutorCard extends StatelessWidget {
  const _TutorCard({
    required this.tutor,
    required this.rupees,
    required this.onTap,
  });
  final TutorListingItem tutor;
  final String Function(int) rupees;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final initial =
        tutor.displayName.isNotEmpty ? tutor.displayName[0].toUpperCase() : 'T';
    final hasRating = (tutor.ratingCount ?? 0) > 0;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: AlpCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  CircleAvatar(
                    radius: 22,
                    backgroundColor: _tintFor(tutor.userId),
                    child: Text(
                      initial,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.bold,
                        fontSize: 18,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          tutor.displayName,
                          style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        if (tutor.tier == 'PREMIUM_VERIFIED')
                          Container(
                            margin: const EdgeInsets.only(top: 2),
                            padding: const EdgeInsets.symmetric(
                                horizontal: 6, vertical: 1,),
                            decoration: BoxDecoration(
                              color: AlpColors.colorBlue,
                              borderRadius: BorderRadius.circular(3),
                            ),
                            child: const Text(
                              'PREMIUM VERIFIED',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 9,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                tutor.headline,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: AlpColors.textMuted,
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.only(top: 8),
                decoration: const BoxDecoration(
                  border: Border(
                    top: BorderSide(color: AlpColors.borderDefault, width: 1),
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    RichText(
                      text: TextSpan(
                        style: const TextStyle(
                          fontSize: 14,
                        ),
                        children: [
                          TextSpan(
                            text: rupees(tutor.hourlyRatePaise),
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                          const TextSpan(
                            text: ' /hr',
                            style: TextStyle(
                              color: AlpColors.textMuted,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (hasRating)
                      Text(
                        '⭐ ${tutor.ratingAvg!.toStringAsFixed(1)} (${tutor.ratingCount})',
                        style: const TextStyle(
                          color: AlpColors.textMuted,
                          fontSize: 12,
                        ),
                      )
                    else
                      const Text(
                        'New tutor',
                        style: TextStyle(
                          color: AlpColors.textFaint,
                          fontSize: 11,
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({required this.text, this.isError = false});
  final String text;
  final bool isError;
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: isError ? const Color(0x33F43F5E) : const Color(0x334F87F6),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(text,
            style: TextStyle(
              color: isError
                  ? AlpColors.colorRed
                  : Theme.of(context).colorScheme.onSurface,
              fontSize: 13,
            ),),
      );
}
