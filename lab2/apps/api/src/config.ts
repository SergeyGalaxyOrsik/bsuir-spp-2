import { resolve } from 'node:path'
import { z } from 'zod'

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3001),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
  UPLOADS_DIR: z.string().default('./uploads'),
  WEB_URL: z.string().default('http://localhost:3000'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  MAIL_FROM: z.string().default('Prompt Library <no-reply@prompts.local>'),
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  ADMIN_NAME: z.string().default('Admin'),
  RATE_LIMIT_STRICT_MAX: z.coerce.number().int().default(10),
  RATE_LIMIT_GLOBAL_MAX: z.coerce.number().int().default(300),
})

export function loadConfig(environment: Record<string, string | undefined>) {
  const env = environmentSchema.parse(environment)
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    databaseUrl: env.DATABASE_URL,
    jwtSecret: env.JWT_SECRET,
    cookieSecure: env.COOKIE_SECURE === 'true',
    uploadsDir: resolve(env.UPLOADS_DIR),
    migrationsDir: resolve('migrations'),
    webUrl: env.WEB_URL,
    smtp: { host: env.SMTP_HOST, port: env.SMTP_PORT, from: env.MAIL_FROM },
    admin:
      env.ADMIN_EMAIL && env.ADMIN_PASSWORD
        ? { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD, name: env.ADMIN_NAME }
        : null,
    rateLimit: { strictMax: env.RATE_LIMIT_STRICT_MAX, globalMax: env.RATE_LIMIT_GLOBAL_MAX },
    accessTokenTtlSeconds: 15 * 60,
    refreshTokenTtlSeconds: 7 * 24 * 60 * 60,
    refreshRotationGraceSeconds: 10,
    maxActiveSessions: 5,
    lockout: { maxFailures: 5, durationSeconds: 15 * 60 },
    passwordResetTtlSeconds: 30 * 60,
    maxAttachmentBytes: 5 * 1024 * 1024,
  }
}

export type Config = ReturnType<typeof loadConfig>
