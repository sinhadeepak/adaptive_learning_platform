export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "STUDENT" | "TEACHER" | "EXPERT" | "MODERATOR" | "INSTITUTION_ADMIN" | "PLATFORM_ADMIN";
  tenantId?: string;
  onboardingState: "NEW" | "EXAM_SELECTED" | "ONBOARDED";
}

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface Session {
  user: User;
  tokens: Tokens;
}

export interface LoginRequest {
  email: string;
  password: string;
  remember?: boolean;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
  locale?: string;
}

export type SsoProvider = "google" | "apple";

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "invalid_credentials"
      | "locked"
      | "rate_limited"
      | "network"
      | "refresh_failed"
      | "reset_token_invalid"
      | "weak_password"
      | "unknown",
    public readonly status?: number
  ) {
    super(message);
    this.name = "AuthError";
  }
}
