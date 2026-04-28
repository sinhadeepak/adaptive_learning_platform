import { createAuthClient, type AuthClient } from "@alp/auth-client";
import { createApiClient, type ApiClient } from "@alp/api-client";
import { env } from "./env";

function createSessionExpiredHandler() {
  let notified = false;
  return () => {
    if (notified) return;
    notified = true;
    // Storage of the intended return path; /login consumes it.
    sessionStorage.setItem("alp.auth.returnTo", window.location.pathname + window.location.search);
    window.location.assign("/login?reason=expired");
  };
}

export const auth: AuthClient = createAuthClient({
  baseUrl: env.apiBaseUrl,
  onSessionExpired: createSessionExpiredHandler(),
});

export const api: ApiClient = createApiClient({
  baseUrl: env.apiBaseUrl,
  auth,
});

// ── Sprint 17 (P3-S2) — Marketplace tutor browsing + booking ──────────

export interface TutorListingItem {
  userId: string;
  displayName: string;
  headline: string;
  hourlyRatePaise: number;
  tier: "STANDARD" | "PREMIUM_VERIFIED" | "RETIRED";
  topicIds: string[];
}

export interface TutorListing {
  items: TutorListingItem[];
  total: number;
  page: number;
  perPage: number;
}

export interface TutorPublicProfile {
  userId: string;
  displayName: string;
  headline: string;
  bio: string;
  hourlyRatePaise: number;
  tier: string;
  applicationStatus: string;
  qualifications: {
    id: string;
    kind: string;
    title: string;
    institution: string | null;
    yearCompleted: number | null;
  }[];
  availability: {
    id: string;
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
  }[];
  topicIds: string[];
}

export interface AvailabilitySlot {
  slotStart: string;
  slotEnd: string;
}

export interface AvailabilityList {
  tutorUserId: string;
  date: string;
  slots: AvailabilitySlot[];
}

export interface Booking {
  id: string;
  studentUserId: string;
  tutorUserId: string;
  slotStart: string;
  slotEnd: string;
  pricePaise: number;
  commissionPaise: number;
  status:
    | "PENDING_PAYMENT"
    | "CONFIRMED"
    | "IN_PROGRESS"
    | "COMPLETED"
    | "CANCELLED_BY_STUDENT"
    | "CANCELLED_BY_TUTOR"
    | "NO_SHOW_STUDENT"
    | "NO_SHOW_TUTOR";
  stripePaymentIntentId: string | null;
  dailyRoomUrl: string | null;
  createdAt: string;
}

export const marketplace = {
  async listTutors(opts?: {
    topicId?: string;
    minHourlyPaise?: number;
    maxHourlyPaise?: number;
    page?: number;
    perPage?: number;
  }): Promise<TutorListing> {
    const params = new URLSearchParams();
    if (opts?.topicId) params.set("topicId", opts.topicId);
    if (opts?.minHourlyPaise) params.set("minHourlyPaise", String(opts.minHourlyPaise));
    if (opts?.maxHourlyPaise) params.set("maxHourlyPaise", String(opts.maxHourlyPaise));
    if (opts?.page) params.set("page", String(opts.page));
    if (opts?.perPage) params.set("perPage", String(opts.perPage));
    const qs = params.toString();
    const url = `${env.apiBaseUrl}/marketplace/tutors${qs ? `?${qs}` : ""}`;
    const res = await auth.fetch(url);
    return asJson<TutorListing>(res);
  },

  async getTutor(userId: string): Promise<TutorPublicProfile> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/tutors/${encodeURIComponent(userId)}`,
    );
    return asJson<TutorPublicProfile>(res);
  },

  async availability(userId: string, date: string): Promise<AvailabilityList> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/tutors/${encodeURIComponent(userId)}/availability?date=${date}`,
    );
    return asJson<AvailabilityList>(res);
  },

  async createBooking(input: {
    tutorUserId: string;
    slotStart: string;
    slotEnd: string;
  }): Promise<Booking> {
    const res = await auth.fetch(`${env.apiBaseUrl}/marketplace/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    return asJson<Booking>(res);
  },

  async confirmPayment(bookingId: string, forceFailure = false): Promise<Booking> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/bookings/${encodeURIComponent(bookingId)}/confirm-payment`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ forceFailure }),
      },
    );
    return asJson<Booking>(res);
  },

  async cancel(bookingId: string, reason?: string): Promise<Booking> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/bookings/${encodeURIComponent(bookingId)}/cancel`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: reason ?? null }),
      },
    );
    return asJson<Booking>(res);
  },

  async myBookings(role: "student" | "tutor" = "student"): Promise<Booking[]> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/bookings/me?role=${role}`,
    );
    const body = await asJson<{ items: Booking[] }>(res);
    return body.items;
  },
};

// ── Sprint 18 (P3-S3) — Course marketplace + ratings ──────────────────

export interface CourseListingItem {
  id: string;
  creatorUserId: string;
  title: string;
  description: string;
  pricePaise: number;
  tier: "FREE" | "STANDARD" | "PREMIUM";
  coverImageUrl: string | null;
}

export interface CourseDetail {
  id: string;
  creatorUserId: string;
  title: string;
  description: string;
  contentMd: string; // truncated preview unless purchased
  pricePaise: number;
  tier: string;
  status: string;
  coverImageUrl: string | null;
  examId: string | null;
  subjectId: string | null;
  topicIds: string[];
  createdAt: string;
  publishedAt: string | null;
  updatedAt: string;
}

export interface Purchase {
  id: string;
  studentUserId: string;
  courseId: string;
  pricePaise: number;
  commissionPaise: number;
  status: "PENDING_PAYMENT" | "PAID" | "REFUNDED";
  stripePaymentIntentId: string | null;
  purchasedAt: string | null;
  createdAt: string;
}

export interface RatingAggregate {
  targetId: string;
  averageStars: number;
  count: number;
  recent: {
    id: string;
    stars: number;
    comment: string | null;
    createdAt: string;
    studentUserId: string;
  }[];
}

export const courseMarketplace = {
  async list(opts?: {
    examId?: string;
    subjectId?: string;
    creatorId?: string;
    maxPricePaise?: number;
    page?: number;
    perPage?: number;
  }): Promise<{ items: CourseListingItem[]; total: number; page: number; perPage: number }> {
    const params = new URLSearchParams();
    if (opts?.examId) params.set("examId", opts.examId);
    if (opts?.subjectId) params.set("subjectId", opts.subjectId);
    if (opts?.creatorId) params.set("creatorId", opts.creatorId);
    if (opts?.maxPricePaise) params.set("maxPricePaise", String(opts.maxPricePaise));
    if (opts?.page) params.set("page", String(opts.page));
    if (opts?.perPage) params.set("perPage", String(opts.perPage));
    const qs = params.toString();
    const url = `${env.apiBaseUrl}/marketplace/courses${qs ? `?${qs}` : ""}`;
    const res = await auth.fetch(url);
    return asJson(res);
  },

  async get(courseId: string): Promise<CourseDetail> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/courses/${encodeURIComponent(courseId)}`,
    );
    return asJson<CourseDetail>(res);
  },

  async purchase(courseId: string): Promise<Purchase> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/courses/${encodeURIComponent(courseId)}/purchase`,
      { method: "POST" },
    );
    return asJson<Purchase>(res);
  },

  async confirmPayment(courseId: string, purchaseId: string): Promise<Purchase> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/courses/${encodeURIComponent(courseId)}/purchase/${encodeURIComponent(purchaseId)}/confirm-payment`,
      { method: "POST" },
    );
    return asJson<Purchase>(res);
  },

  async myPurchases(): Promise<Purchase[]> {
    const res = await auth.fetch(`${env.apiBaseUrl}/marketplace/purchases/me`);
    const body = await asJson<{ items: Purchase[] }>(res);
    return body.items;
  },

  async access(courseId: string): Promise<CourseDetail> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/purchases/me/${encodeURIComponent(courseId)}/access`,
    );
    return asJson<CourseDetail>(res);
  },

  async rate(courseId: string, purchaseId: string, stars: number, comment?: string): Promise<void> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/courses/${encodeURIComponent(courseId)}/rating`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ purchaseId, stars, comment: comment ?? null }),
      },
    );
    await asJson(res);
  },

  async ratings(courseId: string): Promise<RatingAggregate> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/courses/${encodeURIComponent(courseId)}/ratings`,
    );
    return asJson<RatingAggregate>(res);
  },
};

export const tutorRatings = {
  async rate(bookingId: string, stars: number, comment?: string): Promise<void> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/bookings/${encodeURIComponent(bookingId)}/rating`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stars, comment: comment ?? null }),
      },
    );
    await asJson(res);
  },

  async getAggregate(tutorUserId: string): Promise<RatingAggregate> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/marketplace/tutors/${encodeURIComponent(tutorUserId)}/ratings`,
    );
    return asJson<RatingAggregate>(res);
  },
};

// ── Sprint 20 (P3-S5) — Predictive analytics + recommendations ───────

export interface DropoutScore {
  score: number;
  risk_band: "LOW" | "MEDIUM" | "HIGH";
  intervention_kind:
    | "re_engagement_notification"
    | "suggest_tutor"
    | "lower_difficulty"
    | "none"
    | null;
  signals: Record<string, unknown>;
  computed_at: string;
  cached?: boolean;
}

export interface TopicRecommendation {
  topicId: string;
  score: number;
  reasonString: string;
}

export const predictive = {
  async dropout(userId: string): Promise<DropoutScore> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/analytics/predictive/dropout/${encodeURIComponent(userId)}`,
    );
    return asJson<DropoutScore>(res);
  },

  async recommendations(userId: string): Promise<TopicRecommendation[]> {
    const res = await auth.fetch(
      `${env.apiBaseUrl}/analytics/recommendations/${encodeURIComponent(userId)}`,
    );
    const body = await asJson<{ items: TopicRecommendation[] }>(res);
    return body.items;
  },
};
