// Mobile-side marketplace client. Mirrors web-student/src/lib/api.ts
// (the marketplace + courseMarketplace exports). Pure-Dart typed
// wrappers around POST/GET /api/v1/marketplace/* endpoints.

import 'dart:convert';

import '../auth/auth_client.dart';

// ─── Models ──────────────────────────────────────────────────────────────────

class TutorListingItem {
  TutorListingItem({
    required this.userId,
    required this.displayName,
    required this.headline,
    required this.hourlyRatePaise,
    required this.tier,
    required this.topicIds,
    this.ratingAvg,
    this.ratingCount,
  });

  final String userId;
  final String displayName;
  final String headline;
  final int hourlyRatePaise;
  final String tier; // STANDARD | PREMIUM_VERIFIED | RETIRED
  final List<String> topicIds;
  final double? ratingAvg;
  final int? ratingCount;

  static TutorListingItem fromJson(Map<String, dynamic> j) => TutorListingItem(
        userId: j['userId'] as String,
        displayName: j['displayName'] as String,
        headline: j['headline'] as String,
        hourlyRatePaise: (j['hourlyRatePaise'] as num).toInt(),
        tier: j['tier'] as String,
        topicIds: (j['topicIds'] as List?)?.cast<String>() ?? const [],
        ratingAvg: (j['ratingAvg'] as num?)?.toDouble(),
        ratingCount: (j['ratingCount'] as num?)?.toInt(),
      );
}

class TutorQualification {
  TutorQualification({
    required this.id,
    required this.kind,
    required this.title,
    this.institution,
    this.yearCompleted,
  });
  final String id;
  final String kind;
  final String title;
  final String? institution;
  final int? yearCompleted;

  static TutorQualification fromJson(Map<String, dynamic> j) =>
      TutorQualification(
        id: j['id'] as String,
        kind: j['kind'] as String,
        title: j['title'] as String,
        institution: j['institution'] as String?,
        yearCompleted: (j['yearCompleted'] as num?)?.toInt(),
      );
}

class TutorAvailabilityWindow {
  TutorAvailabilityWindow({
    required this.id,
    required this.dayOfWeek,
    required this.startMinute,
    required this.endMinute,
  });
  final String id;
  final int dayOfWeek; // 0=Sunday … 6=Saturday (matches backend)
  final int startMinute;
  final int endMinute;

  static TutorAvailabilityWindow fromJson(Map<String, dynamic> j) =>
      TutorAvailabilityWindow(
        id: j['id'] as String,
        dayOfWeek: (j['dayOfWeek'] as num).toInt(),
        startMinute: (j['startMinute'] as num).toInt(),
        endMinute: (j['endMinute'] as num).toInt(),
      );
}

class TutorPublicProfile {
  TutorPublicProfile({
    required this.userId,
    required this.displayName,
    required this.headline,
    required this.bio,
    required this.hourlyRatePaise,
    required this.tier,
    required this.qualifications,
    required this.availability,
  });
  final String userId;
  final String displayName;
  final String headline;
  final String bio;
  final int hourlyRatePaise;
  final String tier;
  final List<TutorQualification> qualifications;
  final List<TutorAvailabilityWindow> availability;

  static TutorPublicProfile fromJson(Map<String, dynamic> j) =>
      TutorPublicProfile(
        userId: j['userId'] as String,
        displayName: j['displayName'] as String,
        headline: j['headline'] as String,
        bio: (j['bio'] as String?) ?? '',
        hourlyRatePaise: (j['hourlyRatePaise'] as num).toInt(),
        tier: j['tier'] as String,
        qualifications: ((j['qualifications'] as List?) ?? [])
            .cast<Map<String, dynamic>>()
            .map(TutorQualification.fromJson)
            .toList(),
        availability: ((j['availability'] as List?) ?? [])
            .cast<Map<String, dynamic>>()
            .map(TutorAvailabilityWindow.fromJson)
            .toList(),
      );
}

class AvailabilitySlot {
  AvailabilitySlot({required this.slotStart, required this.slotEnd});
  final String slotStart; // ISO-8601
  final String slotEnd;

  static AvailabilitySlot fromJson(Map<String, dynamic> j) => AvailabilitySlot(
        slotStart: j['slotStart'] as String,
        slotEnd: j['slotEnd'] as String,
      );
}

class Booking {
  Booking({
    required this.id,
    required this.tutorUserId,
    required this.slotStart,
    required this.slotEnd,
    required this.pricePaise,
    required this.status,
    this.dailyRoomUrl,
  });
  final String id;
  final String tutorUserId;
  final String slotStart;
  final String slotEnd;
  final int pricePaise;
  final String status;
  final String? dailyRoomUrl;

  static Booking fromJson(Map<String, dynamic> j) => Booking(
        id: j['id'] as String,
        tutorUserId: j['tutorUserId'] as String,
        slotStart: j['slotStart'] as String,
        slotEnd: j['slotEnd'] as String,
        pricePaise: (j['pricePaise'] as num).toInt(),
        status: j['status'] as String,
        dailyRoomUrl: j['dailyRoomUrl'] as String?,
      );
}

class CourseListingItem {
  CourseListingItem({
    required this.id,
    required this.creatorUserId,
    required this.title,
    required this.description,
    required this.pricePaise,
    required this.tier,
    this.coverImageUrl,
    this.ratingAvg,
    this.ratingCount,
  });
  final String id;
  final String creatorUserId;
  final String title;
  final String description;
  final int pricePaise;
  final String tier; // FREE | STANDARD | PREMIUM
  final String? coverImageUrl;
  final double? ratingAvg;
  final int? ratingCount;

  static CourseListingItem fromJson(Map<String, dynamic> j) =>
      CourseListingItem(
        id: j['id'] as String,
        creatorUserId: j['creatorUserId'] as String,
        title: j['title'] as String,
        description: (j['description'] as String?) ?? '',
        pricePaise: (j['pricePaise'] as num).toInt(),
        tier: j['tier'] as String,
        coverImageUrl: j['coverImageUrl'] as String?,
        ratingAvg: (j['ratingAvg'] as num?)?.toDouble(),
        ratingCount: (j['ratingCount'] as num?)?.toInt(),
      );
}

class CourseDetail {
  CourseDetail({
    required this.id,
    required this.creatorUserId,
    required this.title,
    required this.description,
    required this.contentMd,
    required this.pricePaise,
    required this.tier,
    this.coverImageUrl,
  });
  final String id;
  final String creatorUserId;
  final String title;
  final String description;
  final String contentMd;
  final int pricePaise;
  final String tier;
  final String? coverImageUrl;

  static CourseDetail fromJson(Map<String, dynamic> j) => CourseDetail(
        id: j['id'] as String,
        creatorUserId: j['creatorUserId'] as String,
        title: j['title'] as String,
        description: (j['description'] as String?) ?? '',
        contentMd: (j['contentMd'] as String?) ?? '',
        pricePaise: (j['pricePaise'] as num).toInt(),
        tier: j['tier'] as String,
        coverImageUrl: j['coverImageUrl'] as String?,
      );
}

class Purchase {
  Purchase({
    required this.id,
    required this.courseId,
    required this.pricePaise,
    required this.status,
  });
  final String id;
  final String courseId;
  final int pricePaise;
  final String status; // PENDING_PAYMENT | PAID | REFUNDED

  static Purchase fromJson(Map<String, dynamic> j) => Purchase(
        id: j['id'] as String,
        courseId: j['courseId'] as String,
        pricePaise: (j['pricePaise'] as num).toInt(),
        status: j['status'] as String,
      );
}

// ─── Course structure (modules + lessons) ─────────────────────────────────

class LessonItem {
  LessonItem({
    required this.id,
    required this.title,
    required this.contentMd,
    required this.position,
    this.durationSeconds,
  });

  final String id;
  final String title;
  final String contentMd; // empty for non-buyers
  final int position;
  final int? durationSeconds;

  factory LessonItem.fromJson(Map<String, dynamic> j) => LessonItem(
        id: j['id'] as String,
        title: j['title'] as String,
        contentMd: (j['contentMd'] ?? '') as String,
        position: ((j['position'] ?? 0) as num).toInt(),
        durationSeconds: (j['durationSeconds'] as num?)?.toInt(),
      );
}

class ModuleItem {
  ModuleItem({
    required this.id,
    required this.title,
    required this.position,
    this.description,
    required this.lessons,
  });

  final String id;
  final String title;
  final int position;
  final String? description;
  final List<LessonItem> lessons;

  factory ModuleItem.fromJson(Map<String, dynamic> j) {
    final modJson = j['module'] as Map<String, dynamic>;
    final lessonsRaw = (j['lessons'] as List? ?? const [])
        .cast<Map<String, dynamic>>();
    return ModuleItem(
      id: modJson['id'] as String,
      title: modJson['title'] as String,
      position: ((modJson['position'] ?? 0) as num).toInt(),
      description: modJson['description'] as String?,
      lessons: lessonsRaw.map(LessonItem.fromJson).toList(),
    );
  }
}

class CourseStructure {
  CourseStructure({
    required this.courseId,
    required this.modules,
    required this.contentVisible,
  });

  final String courseId;
  final List<ModuleItem> modules;
  // True when the caller is the creator, an admin, or a paying owner.
  // When false the lesson titles render but contentMd is blank so the
  // mobile reader can show a "preview only" paywall.
  final bool contentVisible;

  factory CourseStructure.fromJson(Map<String, dynamic> j) {
    final raw = (j['items'] as List? ?? const []).cast<Map<String, dynamic>>();
    return CourseStructure(
      courseId: j['courseId'] as String,
      modules: raw.map(ModuleItem.fromJson).toList(),
      contentVisible: (j['contentVisible'] ?? false) as bool,
    );
  }
}

// ─── Client ──────────────────────────────────────────────────────────────────

class MarketplaceClient {
  MarketplaceClient(this.auth);
  final AuthClient auth;

  // Tutors

  Future<List<TutorListingItem>> listTutors(
      {int? maxHourlyPaise, int perPage = 50,}) async {
    final qp = <String, String>{'perPage': '$perPage'};
    if (maxHourlyPaise != null) qp['maxHourlyPaise'] = '$maxHourlyPaise';
    final qs = qp.entries
        .map((e) => '${e.key}=${Uri.encodeComponent(e.value)}')
        .join('&');
    final r = await auth.apiGet('/marketplace/tutors?$qs');
    if (r.statusCode != 200) {
      throw 'List tutors failed: HTTP ${r.statusCode}';
    }
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    final items = (j['items'] as List).cast<Map<String, dynamic>>();
    return items.map(TutorListingItem.fromJson).toList();
  }

  Future<TutorPublicProfile> getTutor(String userId) async {
    final r =
        await auth.apiGet('/marketplace/tutors/${Uri.encodeComponent(userId)}');
    if (r.statusCode != 200) {
      throw 'Get tutor failed: HTTP ${r.statusCode}';
    }
    return TutorPublicProfile.fromJson(
        jsonDecode(r.body) as Map<String, dynamic>,);
  }

  Future<List<AvailabilitySlot>> availability(
      String userId, String dateIso,) async {
    final r = await auth.apiGet(
      '/marketplace/tutors/${Uri.encodeComponent(userId)}/availability?date=$dateIso',
    );
    if (r.statusCode != 200) return const [];
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    final slots = (j['slots'] as List? ?? []).cast<Map<String, dynamic>>();
    return slots.map(AvailabilitySlot.fromJson).toList();
  }

  Future<Booking> createBooking({
    required String tutorUserId,
    required String slotStart,
    required String slotEnd,
  }) async {
    final r = await auth.apiPost('/marketplace/bookings', {
      'tutorUserId': tutorUserId,
      'slotStart': slotStart,
      'slotEnd': slotEnd,
    });
    if (r.statusCode != 200 && r.statusCode != 201) {
      throw 'Booking failed: HTTP ${r.statusCode} ${r.body}';
    }
    return Booking.fromJson(jsonDecode(r.body) as Map<String, dynamic>);
  }

  Future<void> confirmPayment(String bookingId) async {
    final r = await auth.apiPost(
      '/marketplace/bookings/${Uri.encodeComponent(bookingId)}/confirm-payment',
      {},
    );
    if (r.statusCode != 200 && r.statusCode != 204) {
      throw 'Confirm payment failed: HTTP ${r.statusCode}';
    }
  }

  Future<List<Booking>> myBookings() async {
    final r = await auth.apiGet('/marketplace/bookings/mine');
    if (r.statusCode != 200) return const [];
    final j = jsonDecode(r.body);
    final list = (j is List ? j : (j as Map<String, dynamic>)['items'] as List)
        .cast<Map<String, dynamic>>();
    return list.map(Booking.fromJson).toList();
  }

  Future<void> cancel(String bookingId) async {
    final r = await auth.apiPost(
      '/marketplace/bookings/${Uri.encodeComponent(bookingId)}/cancel',
      {},
    );
    if (r.statusCode != 200 && r.statusCode != 204) {
      throw 'Cancel failed: HTTP ${r.statusCode}';
    }
  }

  // Courses

  Future<List<CourseListingItem>> listCourses({int perPage = 50}) async {
    final r = await auth.apiGet('/marketplace/courses?perPage=$perPage');
    if (r.statusCode != 200) {
      throw 'List courses failed: HTTP ${r.statusCode}';
    }
    final j = jsonDecode(r.body) as Map<String, dynamic>;
    final items = (j['items'] as List).cast<Map<String, dynamic>>();
    return items.map(CourseListingItem.fromJson).toList();
  }

  Future<CourseDetail> getCourse(String courseId) async {
    final r = await auth
        .apiGet('/marketplace/courses/${Uri.encodeComponent(courseId)}');
    if (r.statusCode != 200) {
      throw 'Get course failed: HTTP ${r.statusCode}';
    }
    return CourseDetail.fromJson(jsonDecode(r.body) as Map<String, dynamic>);
  }

  Future<Purchase> purchase(String courseId) async {
    final r = await auth.apiPost(
      '/marketplace/courses/${Uri.encodeComponent(courseId)}/purchase',
      {},
    );
    if (r.statusCode != 200 && r.statusCode != 201) {
      throw 'Purchase failed: HTTP ${r.statusCode} ${r.body}';
    }
    return Purchase.fromJson(jsonDecode(r.body) as Map<String, dynamic>);
  }

  Future<Purchase> confirmCoursePayment(
      String courseId, String purchaseId,) async {
    final r = await auth.apiPost(
      '/marketplace/courses/${Uri.encodeComponent(courseId)}/purchase/${Uri.encodeComponent(purchaseId)}/confirm-payment',
      {},
    );
    if (r.statusCode != 200 && r.statusCode != 204) {
      throw 'Confirm course payment failed: HTTP ${r.statusCode}';
    }
    return Purchase.fromJson(jsonDecode(r.body) as Map<String, dynamic>);
  }

  Future<List<Purchase>> myPurchases() async {
    final r = await auth.apiGet('/marketplace/purchases/mine');
    if (r.statusCode != 200) return const [];
    final j = jsonDecode(r.body);
    final list = (j is List ? j : (j as Map<String, dynamic>)['items'] as List)
        .cast<Map<String, dynamic>>();
    return list.map(Purchase.fromJson).toList();
  }

  // Sprint 6 — fetch the module/lesson structure for a course. Owners
  // (and admins) get the lesson body in `contentMd`; non-buyers get
  // `contentMd: ''` so the UI can show titles + a paywall hint.
  Future<CourseStructure> courseStructure(String courseId) async {
    final r = await auth.apiGet(
        '/marketplace/courses/${Uri.encodeComponent(courseId)}/structure',);
    if (r.statusCode != 200) {
      throw 'Get structure failed: HTTP ${r.statusCode}';
    }
    return CourseStructure.fromJson(jsonDecode(r.body) as Map<String, dynamic>);
  }

  // Sprint 5 — owners of a course can rate it 1-5 with an optional
  // comment. Backend: POST /marketplace/courses/{id}/rating already
  // exists per services/marketplace/.../creator_routes.py:779.
  // Returns true on success, false on any HTTP error so the UI can
  // show a friendly retry instead of crashing on the response shape.
  Future<bool> rateCourse(
      String courseId, {required int stars, String? comment,}) async {
    if (stars < 1 || stars > 5) return false;
    final r = await auth.apiPost(
      '/marketplace/courses/${Uri.encodeComponent(courseId)}/rating',
      {
        'stars': stars,
        if (comment != null && comment.trim().isNotEmpty)
          'comment': comment.trim(),
      },
    );
    return r.statusCode >= 200 && r.statusCode < 300;
  }
}
