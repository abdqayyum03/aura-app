import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),

  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().default(5432),
  DB_USERNAME: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_DATABASE: z.string().min(1),

  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().default(6379),

  MQTT_URL: z.string().min(1),
  MQTT_USERNAME: z.string().optional(),
  MQTT_PASSWORD: z.string().optional(),
  MQTT_INGEST_TOPIC: z.string().default('aura/+/telemetry'),

  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(8),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
});

export type EnvConfig = z.infer<typeof envSchema>;

// Used by @nestjs/config's `validate` hook. Throws on startup if env is invalid
// rather than letting the app boot in a half-configured state.
export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
