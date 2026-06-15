/**
 * Central configuration, loaded once from environment variables.
 *
 * Per the project rules, all configuration comes from the environment — never
 * hard-coded. We validate it up front so the app fails fast with a clear message
 * rather than misbehaving later.
 */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

/** Walk up from the current working directory to find and load the repo-root `.env`. */
function loadEnv(): void {
  let dir = process.cwd();
  // Up to 6 levels is plenty to climb out of apps/api(/dist) to the repo root.
  for (let i = 0; i < 6; i += 1) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate });
      return;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // No .env file found — rely on real environment variables (e.g. in Docker).
  dotenv.config();
}

loadEnv();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),

  DATABASE_URL: z
    .string()
    .default('postgresql://costing:costing@localhost:5432/costing'),

  JWT_SECRET: z.string().min(1).default('dev-only-change-me-to-a-long-random-string'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  AI_PROVIDER: z.enum(['gemini', 'none']).default('gemini'),
  GEMINI_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default('gemini-1.5-flash'),

  SAP_BASE_URL: z.string().default(''),
  SAP_CLIENT: z.string().default(''),
  SAP_USERNAME: z.string().default(''),
  SAP_PASSWORD: z.string().default(''),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error('Environment validation failed');
}

const env = parsed.data;

export const config = {
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  /** Allowed browser origins (comma-separated in WEB_ORIGIN). */
  webOrigins: env.WEB_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
  db: {
    url: env.DATABASE_URL,
  },
  auth: {
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN,
  },
  ai: {
    provider: env.AI_PROVIDER,
    geminiApiKey: env.GEMINI_API_KEY,
    geminiModel: env.GEMINI_MODEL,
    /** True only when a real key is configured. */
    get enabled(): boolean {
      return env.AI_PROVIDER === 'gemini' && env.GEMINI_API_KEY.trim().length > 0;
    },
  },
  sap: {
    baseUrl: env.SAP_BASE_URL,
    client: env.SAP_CLIENT,
    username: env.SAP_USERNAME,
    password: env.SAP_PASSWORD,
    /** True only when SAP connection details are present. */
    get configured(): boolean {
      return env.SAP_BASE_URL.trim().length > 0 && env.SAP_USERNAME.trim().length > 0;
    },
  },
} as const;

export type AppConfig = typeof config;
