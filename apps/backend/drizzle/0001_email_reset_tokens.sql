-- Phase 10.1 — add email verification + password reset fields to users.
--
-- These columns support the engineer-facing flows:
--   1. /auth/register → emails a verification link
--   2. /auth/forgot   → emails a reset link
--   3. /auth/reset    → validates the token + sets new password
--
-- All three columns are NULLABLE — legacy rows from Phase 6.8.4 admin
-- bootstrap keep `verified = true` (set via seed-admin.ts) and don't
-- need a verification token.

ALTER TABLE "users"
  ADD COLUMN "email_verification_token" text,
  ADD COLUMN "password_reset_token" text,
  ADD COLUMN "password_reset_expires" timestamptz;
