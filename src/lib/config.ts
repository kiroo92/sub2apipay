import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SUB2API_BASE_URL: z
    .string()
    .url()
    .transform((value) => value.replace(/\/+$/, '')),
  SUB2API_ADMIN_API_KEY: z.string().min(1),
  ADMIN_TOKEN: z.string().min(16),
  NEXT_PUBLIC_APP_URL: z.string().url(),
  LOTTERY_START_AT: z.string().datetime({ offset: true }).default('2026-08-07T00:00:00+08:00'),
  LOTTERY_END_AT: z.string().datetime({ offset: true }).default('2026-09-01T00:00:00+08:00'),
  LOTTERY_ADMIN_CONTACT: z.string().min(1).default('support@example.com'),
  LOTTERY_VOUCHER_REDEMPTION_DAYS: z.coerce.number().int().min(1).max(90).default(7),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;

  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return {
      DATABASE_URL: 'postgresql://build:build@localhost:5432/build',
      SUB2API_BASE_URL: 'https://localhost',
      SUB2API_ADMIN_API_KEY: 'build-key',
      ADMIN_TOKEN: 'build-admin-token-123456',
      NEXT_PUBLIC_APP_URL: 'https://localhost',
      LOTTERY_START_AT: '2026-08-07T00:00:00+08:00',
      LOTTERY_END_AT: '2026-09-01T00:00:00+08:00',
      LOTTERY_ADMIN_CONTACT: 'support@example.com',
      LOTTERY_VOUCHER_REDEMPTION_DAYS: 7,
    };
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables');
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}
