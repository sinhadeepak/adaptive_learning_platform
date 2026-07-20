// VidyaEditProfileScreen — Phase D. Native profile editor (replaces the
// Aurora EditProfileScreen). Edits first/last name via ApiClient.updateProfile
// (/profile/me). Avatar upload is a later enhancement.

import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../auth/auth_client.dart';

class VidyaEditProfileScreen extends StatefulWidget {
  final AuthClient auth;
  const VidyaEditProfileScreen({super.key, required this.auth});

  @override
  State<VidyaEditProfileScreen> createState() => _VidyaEditProfileScreenState();
}

class _VidyaEditProfileScreenState extends State<VidyaEditProfileScreen> {
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  bool _loading = true;
  bool _saving = false;
  String? _error;
  String? _saved;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _firstName.dispose();
    _lastName.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final p = await ApiClient(widget.auth).getProfile();
      if (!mounted) return;
      _firstName.text = p?.firstName ?? widget.auth.user?.firstName ?? '';
      _lastName.text = p?.lastName ?? widget.auth.user?.lastName ?? '';
    } catch (_) {
      _firstName.text = widget.auth.user?.firstName ?? '';
      _lastName.text = widget.auth.user?.lastName ?? '';
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _save() async {
    final fn = _firstName.text.trim();
    final ln = _lastName.text.trim();
    if (fn.isEmpty) {
      setState(() => _error = 'First name is required.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
      _saved = null;
    });
    try {
      final updated = await ApiClient(widget.auth)
          .updateProfile(firstName: fn, lastName: ln);
      if (!mounted) return;
      if (updated != null) {
        setState(() => _saved = 'Saved.');
      } else {
        setState(() => _error = "Couldn't save. Try again.");
      }
    } catch (_) {
      if (mounted) setState(() => _error = "Couldn't save. Try again.");
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final v = VidyaThemeData.of(context);
    return VidyaScaffold(
      appBar: VidyaAppBar(
        title: 'Edit profile',
        leading: IconButton(
          icon: Icon(Icons.arrow_back, color: v.ink),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
              children: [
                _Field(label: 'FIRST NAME', controller: _firstName, v: v),
                const SizedBox(height: 18),
                _Field(label: 'LAST NAME', controller: _lastName, v: v),
                if (_error != null) ...[
                  const SizedBox(height: 16),
                  Text(
                    _error!,
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 13,
                      color: v.bad,
                    ),
                  ),
                ],
                if (_saved != null) ...[
                  const SizedBox(height: 16),
                  Text(
                    _saved!,
                    style: TextStyle(
                      fontFamily: VidyaFonts.ui,
                      fontSize: 13,
                      color: v.good,
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                VidyaButton(
                  label: _saving ? 'Saving…' : 'Save changes',
                  onPressed: _saving ? null : _save,
                  size: VidyaButtonSize.lg,
                ),
              ],
            ),
    );
  }
}

class _Field extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final VidyaThemeData v;
  const _Field(
      {required this.label, required this.controller, required this.v});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            fontFamily: VidyaFonts.mono,
            fontSize: 11,
            color: v.ink3,
            letterSpacing: 1.4,
          ),
        ),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            color: v.card,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: v.rule),
          ),
          child: TextField(
            controller: controller,
            style: TextStyle(color: v.ink, fontFamily: VidyaFonts.ui),
            decoration: const InputDecoration(
              border: InputBorder.none,
              contentPadding: EdgeInsets.symmetric(vertical: 14),
            ),
          ),
        ),
      ],
    );
  }
}
