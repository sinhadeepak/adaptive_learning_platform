import 'package:flutter/material.dart';
import '../tokens.dart';

class VidyaScaffold extends StatelessWidget {
  final Widget body;
  final PreferredSizeWidget? appBar;
  final Widget? bottomNavigationBar;
  final Widget? floatingActionButton;
  final bool safeArea;
  final EdgeInsetsGeometry? padding;

  const VidyaScaffold({
    super.key,
    required this.body,
    this.appBar,
    this.bottomNavigationBar,
    this.floatingActionButton,
    this.safeArea = true,
    this.padding,
  });

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    Widget content = body;
    if (padding != null) content = Padding(padding: padding!, child: content);
    if (safeArea) content = SafeArea(child: content);
    return Scaffold(
      backgroundColor: v.paper,
      appBar: appBar,
      bottomNavigationBar: bottomNavigationBar,
      floatingActionButton: floatingActionButton,
      body: content,
    );
  }
}
