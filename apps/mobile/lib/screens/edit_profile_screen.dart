import 'package:alp_design_tokens/alp_design_tokens.dart';
import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../aurora/widgets/widgets.dart';
import '../auth/auth_client.dart';
import '../widgets/alp_card.dart';

/// Edit name fields. Wired to PATCH /profile/me on save.
class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({super.key, required this.api, required this.auth});
  final ApiClient api;
  final AuthClient auth;

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  bool _saving = false;
  String? _error;
  String? _success;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final p = await widget.api.getProfile();
    if (!mounted) return;
    if (p != null) {
      _firstName.text = p.firstName;
      _lastName.text = p.lastName;
    } else {
      _firstName.text = widget.auth.user?.firstName ?? '';
      _lastName.text = widget.auth.user?.lastName ?? '';
    }
    setState(() => _loading = false);
  }

  Future<void> _save() async {
    final fn = _firstName.text.trim();
    final ln = _lastName.text.trim();
    if (fn.isEmpty || ln.isEmpty) {
      setState(() => _error = 'First name and last name are required.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
      _success = null;
    });
    try {
      final updated = await widget.api.updateProfile(firstName: fn, lastName: ln);
      if (!mounted) return;
      if (updated == null) {
        setState(() {
          _error = 'Could not save — try again.';
          _saving = false;
        });
        return;
      }
      // Mirror into AuthClient so the profile tab + greeting stay fresh.
      final u = widget.auth.user;
      if (u != null) {
        widget.auth.setUser(User(
          id: u.id,
          email: u.email,
          firstName: updated.firstName,
          lastName: updated.lastName,
          role: u.role,
          onboardingState: u.onboardingState,
          tenantId: u.tenantId,
        ),);
      }
      setState(() {
        _saving = false;
        _success = 'Profile updated.';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Save failed: $e';
        _saving = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuroraScaffold(
      appBar: const AuroraAppBar(title: 'Edit Profile'),
      body: _loading
          ? const Center(child: AuroraSpinner(size: 32))
          : ListView(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
              children: [
                AlpCard(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _label('First name'),
                      _field(controller: _firstName, hint: 'First name'),
                      const SizedBox(height: 14),
                      _label('Last name'),
                      _field(controller: _lastName, hint: 'Last name'),
                      const SizedBox(height: 14),
                      _label('Email'),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: AlpColors.bgSurface3,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          widget.auth.user?.email ?? '—',
                          style: const TextStyle(color: AlpColors.textMuted, fontSize: 14),
                        ),
                      ),
                      const SizedBox(height: 4),
                      const Text(
                        'Email is managed via your auth provider — change it from the web portal.',
                        style: TextStyle(color: AlpColors.textFaint, fontSize: 11),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Text(_error!, style: const TextStyle(color: AlpColors.colorRed)),
                  ),
                if (_success != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Text(_success!, style: const TextStyle(color: AlpColors.colorGreen)),
                  ),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _saving ? null : _save,
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                    ),
                    child: Text(
                      _saving ? 'Saving…' : 'Save Profile',
                      style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  Widget _label(String t) => Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Text(
          t,
          style: const TextStyle(
            color: AlpColors.textMuted,
            fontSize: 11,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.4,
          ),
        ),
      );

  Widget _field({required TextEditingController controller, required String hint}) {
    return TextField(
      controller: controller,
      style: const TextStyle(),
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: AlpColors.textMuted),
        filled: true,
        fillColor: AlpColors.bgSurface3,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(8),
          borderSide: BorderSide.none,
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      ),
    );
  }
}
