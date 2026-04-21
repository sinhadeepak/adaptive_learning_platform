import 'package:flutter/material.dart';

void main() {
  runApp(const AdaptiveLearningApp());
}

class AdaptiveLearningApp extends StatelessWidget {
  const AdaptiveLearningApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Adaptive Learning Platform',
      theme: ThemeData(useMaterial3: true, colorSchemeSeed: Colors.indigo),
      home: const Scaffold(
        body: Center(
          child: Text(
            'Adaptive Learning Platform\nSprint 0 shell',
            textAlign: TextAlign.center,
          ),
        ),
      ),
    );
  }
}
