"""Pydantic request / response models aligned with openapi/phase1.yaml."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    firstName: str = Field(min_length=1, max_length=60)
    lastName: str = Field(min_length=1, max_length=60)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    phone: str | None = None
    locale: str = Field(default="en-IN")


class RegisterResponse(BaseModel):
    userId: str
    otpChannel: Literal["email", "sms"]


class OtpVerifyRequest(BaseModel):
    userId: str
    code: str = Field(min_length=6, max_length=6)
    channel: Literal["email", "sms"]


class OtpResendRequest(BaseModel):
    userId: str
    channel: Literal["email", "sms"]


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    remember: bool = False


class RefreshRequest(BaseModel):
    refreshToken: str


class LogoutRequest(BaseModel):
    refreshToken: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=16, max_length=128)
    newPassword: str = Field(min_length=12, max_length=128)


class User(BaseModel):
    id: str
    email: str
    firstName: str
    lastName: str
    role: Literal["STUDENT", "TEACHER", "EXPERT", "MODERATOR", "INSTITUTION_ADMIN", "PLATFORM_ADMIN"]
    tenantId: str | None = None
    onboardingState: Literal["NEW", "EXAM_SELECTED", "ONBOARDED"]


class Tokens(BaseModel):
    accessToken: str
    refreshToken: str
    expiresAt: int


class Session(BaseModel):
    user: User
    tokens: Tokens


class Problem(BaseModel):
    code: str
    message: str
    fields: list[str] | None = None
