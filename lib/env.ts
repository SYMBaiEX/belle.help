import { z } from "zod";

/**
 * Startup environment validation. Import `env` (or call `requireEnv`) from
 * server-side code that needs configuration — never log the resolved
 * values, since several of these are secrets.
 */

const envSchema = z.object({
  APP_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "must be 64 hex characters (32 bytes)"),
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url()
    .optional()
    .default("http://localhost:3000"),
  NEXT_PUBLIC_BELLE_PHONE_NUMBER: z.string().optional(),
  LINQ_API_KEY: z.string().optional(),
  LINQ_API_BASE_URL: z
    .string()
    .url()
    .optional()
    .default("https://api.linqapp.com"),
  LINQ_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_CONVEX_URL: z.string().url().optional(),
  CONVEX_DEPLOYMENT: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  AI_GATEWAY_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\n` +
        "See .env.example for the full list of variables and generate " +
        "secrets with e.g. `openssl rand -hex 32`.",
    );
  }
  return result.data;
}

/**
 * Lazily parsed, cached environment. Throws on first access if required
 * variables are missing or malformed.
 */
export const env = new Proxy({} as Env, {
  get(_target, prop: string) {
    if (!cached) {
      cached = parseEnv();
    }
    return cached[prop as keyof Env];
  },
});

/**
 * Throws an actionable error naming the missing variable, for call sites
 * that need a single required value rather than the whole parsed env.
 */
export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = env[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(
      `Missing required environment variable: ${String(key)}. ` +
        "See .env.example for details.",
    );
  }
  return value as NonNullable<Env[K]>;
}

/** Reset the cached env — intended for tests only. */
export function __resetEnvCacheForTests(): void {
  cached = null;
}
