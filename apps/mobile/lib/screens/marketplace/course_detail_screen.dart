// Course detail + purchase flow.

import 'package:flutter/material.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';
import '../../aurora/widgets/widgets.dart';

import '../../api/marketplace.dart';
import '../../widgets/alp_card.dart';
import 'course_read_screen.dart';
import 'my_purchases_screen.dart';

class CourseDetailScreen extends StatefulWidget {
  const CourseDetailScreen(
      {super.key, required this.client, required this.courseId,});
  final MarketplaceClient client;
  final String courseId;

  @override
  State<CourseDetailScreen> createState() => _CourseDetailScreenState();
}

class _CourseDetailScreenState extends State<CourseDetailScreen> {
  CourseDetail? _course;
  String? _error;
  bool _busy = false;
  bool _owned = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait([
        widget.client.getCourse(widget.courseId),
        widget.client.myPurchases(),
      ]);
      if (!mounted) return;
      final course = results[0] as CourseDetail;
      final purchases = results[1] as List<Purchase>;
      final owns = purchases.any((p) =>
          p.courseId == widget.courseId && p.status != 'REFUNDED',);
      setState(() {
        _course = course;
        _owned = owns;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = '$e');
    }
  }

  String _rupees(int paise) => '₹${(paise / 100).toStringAsFixed(0)}';

  void _openMyPurchases() {
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
          builder: (_) => MyPurchasesScreen(client: widget.client),),
    );
  }

  // Sprint 6 — owned-course "Open" now leads into the lesson player
  // instead of bouncing the user back to the purchases list. Falls
  // back to MyPurchases only when we don't have the course details
  // hydrated yet (shouldn't happen in practice — the button is gated
  // on _course != null).
  void _openCourseReader() {
    final c = _course;
    if (c == null) {
      _openMyPurchases();
      return;
    }
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => CourseReadScreen(
        client: widget.client,
        courseId: c.id,
        courseTitle: c.title,
        fallbackContentMd: c.contentMd,
      ),
    ),);
  }

  Future<void> _purchase() async {
    final c = _course;
    if (c == null) return;
    if (_owned) {
      _openCourseReader();
      return;
    }
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Confirm purchase?'),
        content: Text('Buy "${c.title}" for ${_rupees(c.pricePaise)}?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel'),),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Buy'),),
        ],
      ),
    );
    if (ok != true) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final p = await widget.client.purchase(c.id);
      await widget.client.confirmCoursePayment(c.id, p.id);
      if (!mounted) return;
      // Fresh purchase → land directly in the lesson reader so the
      // student starts learning instead of staring at a purchase list.
      _openCourseReader();
    } catch (e) {
      if (!mounted) return;
      // 409 already_purchased → not really an error: server confirms the
      // user already owns this course. Flip into the owned state and
      // route them to the reader instead of showing red.
      if ('$e'.contains('already_purchased') || '$e'.contains('HTTP 409')) {
        setState(() {
          _owned = true;
          _error = null;
          _busy = false;
        });
        _openCourseReader();
        return;
      }
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = _course;
    return AuroraScaffold(
      appBar: AuroraAppBar(title: c?.title ?? 'Course'),
      body: c == null
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
                Container(
                  height: 120,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(10),
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [AlpColors.colorBlue, AlpColors.colorPurple],
                    ),
                  ),
                  child: const Center(
                      child: Text('🎓', style: TextStyle(fontSize: 56)),),
                ),
                const SizedBox(height: 16),
                Text(c.title,
                    style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.bold,),),
                const SizedBox(height: 8),
                Text(c.description,
                    style: const TextStyle(
                        color: AlpColors.textSecondary, fontSize: 14,),),
                const SizedBox(height: 16),
                AlpCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(_owned ? 'OWNED' : 'PRICE',
                          style: const TextStyle(
                              color: AlpColors.textMuted,
                              fontSize: 11,
                              letterSpacing: 1.2,),),
                      const SizedBox(height: 4),
                      Text(_owned ? 'Purchased' : _rupees(c.pricePaise),
                          style: const TextStyle(
                              fontSize: 28,
                              fontWeight: FontWeight.bold,),),
                      const SizedBox(height: 12),
                      ElevatedButton(
                        style: ElevatedButton.styleFrom(
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                        onPressed: _busy ? null : _purchase,
                        child: Text(_busy
                            ? 'Processing…'
                            : (_owned ? 'Open course' : 'Buy course'),),
                      ),
                      const SizedBox(height: 6),
                      Text(
                          _owned
                              ? 'You already own this course'
                              : 'Lifetime access · Refund within 7 days',
                          style: const TextStyle(
                              color: AlpColors.textMuted, fontSize: 11,),
                          textAlign: TextAlign.center,),
                    ],
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: const Color(0x33F43F5E),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(_error!,
                        style: const TextStyle(
                            color: AlpColors.colorRed, fontSize: 13,),),
                  ),
                ],
                if (c.contentMd.trim().length > 20) ...[
                  const SizedBox(height: 24),
                  const Text('About this course',
                      style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,),),
                  const SizedBox(height: 8),
                  AlpCard(
                    child: Text(c.contentMd,
                        style: const TextStyle(
                            color: AlpColors.textSecondary,
                            fontSize: 13,
                            height: 1.5,),),
                  ),
                ],

                // Sprint 5 — owners of the course can leave a rating.
                // Hidden for non-owners since rate-without-buy doesn't
                // make sense and the backend would reject it anyway.
                if (_owned) ...[
                  const SizedBox(height: 24),
                  _RateCourseCard(
                    onSubmit: (stars, comment) async {
                      final ok = await widget.client.rateCourse(c.id,
                          stars: stars, comment: comment,);
                      if (!mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          behavior: SnackBarBehavior.floating,
                          content: Text(ok
                              ? 'Thanks — your rating was saved.'
                              : "Couldn't save your rating. Try again.",),
                        ),
                      );
                    },
                  ),
                ],
              ],
            ),
    );
  }
}

// Inline 5-star rating + optional comment widget. Stays on the
// course-detail screen; submitting routes through MarketplaceClient.
class _RateCourseCard extends StatefulWidget {
  const _RateCourseCard({required this.onSubmit});
  final Future<void> Function(int stars, String? comment) onSubmit;

  @override
  State<_RateCourseCard> createState() => _RateCourseCardState();
}

class _RateCourseCardState extends State<_RateCourseCard> {
  int _stars = 0;
  final _comment = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_stars < 1 || _busy) return;
    setState(() => _busy = true);
    final c = _comment.text.trim();
    await widget.onSubmit(_stars, c.isEmpty ? null : c);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _comment.clear();
      _stars = 0;
    });
  }

  @override
  Widget build(BuildContext context) {
    return AlpCard(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Rate this course',
              style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,),),
          const SizedBox(height: 4),
          const Text(
            'How is the content so far? Your rating helps other students decide.',
            style: TextStyle(color: AlpColors.textMuted, fontSize: 12),
          ),
          const SizedBox(height: 10),
          Row(
            children: List.generate(5, (i) {
              final filled = i < _stars;
              return IconButton(
                onPressed: _busy
                    ? null
                    : () => setState(() => _stars = i + 1),
                icon: Icon(
                  filled ? Icons.star_rounded : Icons.star_border_rounded,
                  color: filled ? AlpColors.colorAmber : AlpColors.textMuted,
                  size: 32,
                ),
                padding: EdgeInsets.zero,
                constraints:
                    const BoxConstraints(minWidth: 36, minHeight: 36),
                tooltip: '${i + 1}',
              );
            }),
          ),
          const SizedBox(height: 6),
          TextField(
            controller: _comment,
            maxLines: 3,
            maxLength: 280,
            enabled: !_busy,
            decoration: const InputDecoration(
              hintText: 'Share what worked or didn\'t (optional)',
              border: OutlineInputBorder(),
              isDense: true,
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _stars >= 1 && !_busy ? _submit : null,
              style: ElevatedButton.styleFrom(
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 13),
              ),
              child: Text(_busy ? 'Sending…' : 'Submit rating'),
            ),
          ),
        ],
      ),
    );
  }
}
