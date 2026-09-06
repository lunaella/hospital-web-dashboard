import "dotenv/config";

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL", "postgresql://resq:resq_dev_password@localhost:5432/resq"),
  redisUrl: required("REDIS_URL", "redis://:resq_dev_password@localhost:6379"),
  jwtSecret: required("JWT_SECRET", "change_me_in_production"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  // The donor-facing Android app — a consumer app, so "stay logged in" is
  // the normal expectation, unlike an admin's shared-terminal 8h session.
  donorJwtExpiresIn: process.env.DONOR_JWT_EXPIRES_IN ?? "30d",

  // Donor notifications — intentionally NOT `required()`. A thesis/demo
  // environment shouldn't refuse to boot just because SMS/email isn't
  // configured yet; sendSms/sendEmail check for these themselves and
  // report a clear "channel not configured" failure per attempt instead.
  semaphoreApiKey: process.env.SEMAPHORE_API_KEY || null,
  semaphoreSenderName: process.env.SEMAPHORE_SENDER_NAME || null,
  resendApiKey: process.env.RESEND_API_KEY || null,
  notificationFromEmail: process.env.NOTIFICATION_FROM_EMAIL || "onboarding@resend.dev",

  // Didit (third-party KYC — see donorPortal.controller.js's
  // startDiditVerification and controllers/diditWebhook.controller.js).
  // Not required() for the same reason as the SMS/email config above: a
  // dev environment without these shouldn't refuse to boot, it should just
  // 503 on the one endpoint that needs them.
  diditApiKey: process.env.DIDIT_API_KEY || null,
  diditWebhookSecret: process.env.DIDIT_WEBHOOK_SECRET || null,
  // The "ResQ Donor Verification" workflow — not a secret, just which
  // configured flow (ID + Liveness + Face Match) a session should run.
  diditWorkflowId: process.env.DIDIT_WORKFLOW_ID || "8011ee0f-0c26-4860-8a57-b0ee34eeabb6",
};
