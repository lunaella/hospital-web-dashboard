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
};
