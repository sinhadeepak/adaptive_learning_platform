// Public course listing — mirrors web-student/src/pages/Courses.tsx.

import 'package:flutter/material.dart';
import 'package:alp_design_tokens/alp_design_tokens.dart';

import '../../api/marketplace.dart';
import '../../widgets/alp_card.dart';
import 'course_detail_screen.dart';

class CoursesScreen extends StatefulWidget {
  const CoursesScreen({super.key, required this.client});
  final MarketplaceClient client;

  @override
  State<CoursesScreen> createState() => _CoursesScreenState();
}

class _CoursesScreenState extends State<CoursesScreen> {
  List<CourseListingItem>? _items;
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
      final items = await widget.client.listCourses();
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
    return Scaffold(
      backgroundColor: AlpColors.bgBase,
      appBar: AppBar(title: const Text('Courses')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Text(
              'Self-paced courses authored by community creators.',
              style: TextStyle(color: AlpColors.textMuted, fontSize: 13),
            ),
            const SizedBox(height: 16),
            if (_error != null)
              Container(
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
              const Text('No published courses yet.',
                  style: TextStyle(color: AlpColors.textMuted),)
            else
              ..._items!.map((c) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: AlpCard(
                      onTap: () => Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) => CourseDetailScreen(
                            client: widget.client, courseId: c.id,),
                      ),),
                      padding: EdgeInsets.zero,
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(13),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Container(
                              height: 84,
                              decoration: const BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                  colors: [
                                    AlpColors.colorBlue,
                                    AlpColors.colorPurple,
                                  ],
                                ),
                              ),
                              child: const Center(
                                  child: Text('🎓',
                                      style: TextStyle(fontSize: 36),),),
                            ),
                            Padding(
                              padding: const EdgeInsets.all(14),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(c.title,
                                      style: const TextStyle(
                                          color: AlpColors.textPrimary,
                                          fontSize: 15,
                                          fontWeight: FontWeight.bold,),),
                                  if (c.description.isNotEmpty)
                                    Padding(
                                      padding: const EdgeInsets.only(top: 6),
                                      child: Text(
                                        c.description,
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                            color: AlpColors.textMuted,
                                            fontSize: 13,),
                                      ),
                                    ),
                                  const SizedBox(height: 10),
                                  Row(
                                    mainAxisAlignment:
                                        MainAxisAlignment.spaceBetween,
                                    children: [
                                      Text(_rupees(c.pricePaise),
                                          style: const TextStyle(
                                              color: AlpColors.textPrimary,
                                              fontSize: 16,
                                              fontWeight: FontWeight.bold,),),
                                      if ((c.ratingCount ?? 0) > 0)
                                        Text(
                                          '⭐ ${c.ratingAvg!.toStringAsFixed(1)} (${c.ratingCount})',
                                          style: const TextStyle(
                                              color: AlpColors.textMuted,
                                              fontSize: 12,),
                                        )
                                      else
                                        const Text('New',
                                            style: TextStyle(
                                                color: AlpColors.textFaint,
                                                fontSize: 11,),),
                                    ],
                                  ),
                                ],
                              ),
                            ),
                          ],
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
