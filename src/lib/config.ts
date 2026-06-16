import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SUB2API_BASE_URL: z.string().url(),
  SUB2API_ADMIN_API_KEY: z.string().min(1),
  ADMIN_TOKEN: z.string().min(16),
  NEXT_PUBLIC_APP_URL: z.string().url(),
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
