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

  // Donor notifications — intentionally NOT `required()`. A thesis/demo
  // environment shouldn't refuse to boot just because SMS/email isn't
  // configured yet; sendSms/sendEmail check for these themselves and
  // report a clear "channel not configured" failure per attempt instead.
  semaphoreApiKey: process.env.SEMAPHORE_API_KEY || null,
  semaphoreSenderName: process.env.SEMAPHORE_SENDER_NAME || null,
  resendApiKey: process.env.RESEND_API_KEY || null,
  notificationFromEmail: process.env.NOTIFICATION_FROM_EMAIL || "onboarding@resend.dev",
};
