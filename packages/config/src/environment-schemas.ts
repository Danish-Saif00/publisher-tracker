import { z } from 'zod';

const DEFAULT_API_HOST = '127.0.0.1';
const DEFAULT_API_PORT = 4000;
const DEFAULT_API_BASE_PATH = '/api/v1';
const DEFAULT_TRACKER_HOST = '127.0.0.1';
const DEFAULT_TRACKER_PORT = 4100;
const DEFAULT_REQUEST_BODY_LIMIT = '1mb';
const DEFAULT_CORS_ALLOWED_ORIGIN = 'http://localhost:3000';
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_API_RATE_LIMIT_MAX_REQUESTS = 120;
const DEFAULT_TRACKER_RATE_LIMIT_MAX_REQUESTS = 1_000;
const DEFAULT_SWAGGER_PATH = '/docs';
const DEFAULT_OPENAPI_JSON_PATH = '/openapi.json';
const DEFAULT_PUBLIC_APP_URL = 'http://localhost:3000';
const DEFAULT_REDIS_URL = 'redis://127.0.0.1:6379';
const DEFAULT_QUEUE_PREFIX = 'affiliate-tracker';
const DEFAULT_WORKER_CONCURRENCY = 5;
const DEFAULT_QUEUE_JOB_ATTEMPTS = 5;
const DEFAULT_QUEUE_JOB_BACKOFF_MS = 1_000;
const DEFAULT_DATABASE_POOL_MIN = 1;
const DEFAULT_DATABASE_POOL_MAX = 10;
const DEFAULT_DATABASE_QUERY_TIMEOUT_MS = 10_000;
const DEFAULT_TRACKING_COOKIE_NAME = 'affiliate_visitor_id';
const DEFAULT_TRACKING_COOKIE_MAX_AGE_DAYS = 365;

const pathPattern = /^\/[A-Za-z0-9/_.-]*$/;
const bodyLimitPattern = /^\d+(?:b|kb|mb|gb)$/i;
const hostnamePattern =
  /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;
const cookieNamePattern = /^[A-Za-z0-9._-]+$/;

function normalizeBlankString(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const normalizedValue = value.trim();

  return normalizedValue.length === 0 ? undefined : normalizedValue;
}

function createStringWithDefault(defaultValue: string) {
  return z.preprocess(normalizeBlankString, z.string().trim().min(1).default(defaultValue));
}

function createIntegerWithDefault(
  defaultValue: number,
  minimumValue: number,
  maximumValue: number,
) {
  return z.preprocess((value: unknown): unknown => {
    const normalizedValue = normalizeBlankString(value);

    return normalizedValue === undefined ? defaultValue : normalizedValue;
  }, z.coerce.number().int().min(minimumValue).max(maximumValue));
}

function createBooleanWithDefault(defaultValue: boolean) {
  return z.preprocess((value: unknown): unknown => {
    const normalizedValue = normalizeBlankString(value);

    if (normalizedValue === undefined) {
      return defaultValue;
    }

    if (typeof normalizedValue !== 'string') {
      return normalizedValue;
    }

    const lowerCaseValue = normalizedValue.toLowerCase();

    if (lowerCaseValue === 'true') {
      return true;
    }

    if (lowerCaseValue === 'false') {
      return false;
    }

    return normalizedValue;
  }, z.boolean());
}

function createProtocolUrlSchema(protocols: readonly string[]) {
  return z.preprocess(
    normalizeBlankString,
    z.url().refine((value) => protocols.includes(new URL(value).protocol), {
      message: `URL protocol must be one of: ${protocols.join(', ')}`,
    }),
  );
}

const pathSchema = (defaultValue: string) =>
  z.preprocess(
    normalizeBlankString,
    z
      .string()
      .trim()
      .regex(pathPattern, 'Value must be an absolute application path.')
      .default(defaultValue),
  );

const requestBodyLimitSchema = z.preprocess(
  normalizeBlankString,
  z
    .string()
    .trim()
    .regex(bodyLimitPattern, 'Request body limit must use b, kb, mb, or gb units.')
    .default(DEFAULT_REQUEST_BODY_LIMIT),
);

const corsAllowedOriginsSchema = z.preprocess((value: unknown): unknown => {
  const normalizedValue = normalizeBlankString(value);

  if (normalizedValue === undefined) {
    return [DEFAULT_CORS_ALLOWED_ORIGIN];
  }

  if (typeof normalizedValue !== 'string') {
    return normalizedValue;
  }

  return normalizedValue
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}, z.array(z.url()).min(1));

const nonEmptyStringSchema = z.string().trim().min(1);
const secretSchema = z.string().trim().min(32, 'Secret must contain at least 32 characters.');
const webUrlSchema = createProtocolUrlSchema(['http:', 'https:']);
const postgresUrlSchema = createProtocolUrlSchema(['postgres:', 'postgresql:']);
const redisUrlSchema = createProtocolUrlSchema(['redis:', 'rediss:']);

export const baseServiceEnvironmentSchema = z.object({
  APP_ENV: z.preprocess(
    normalizeBlankString,
    z.enum(['development', 'test', 'production']).default('development'),
  ),
  LOG_LEVEL: z.preprocess(
    normalizeBlankString,
    z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  ),
  LOG_PRETTY: createBooleanWithDefault(true),
});

export const apiEnvironmentSchema = baseServiceEnvironmentSchema.extend({
  API_HOST: createStringWithDefault(DEFAULT_API_HOST),
  API_PORT: createIntegerWithDefault(DEFAULT_API_PORT, 1, 65_535),
  API_BASE_PATH: pathSchema(DEFAULT_API_BASE_PATH),
  CORS_ALLOWED_ORIGINS: corsAllowedOriginsSchema,
  TRUST_PROXY: createBooleanWithDefault(false),
  REQUEST_BODY_LIMIT: requestBodyLimitSchema,
  API_RATE_LIMIT_WINDOW_MS: createIntegerWithDefault(DEFAULT_RATE_LIMIT_WINDOW_MS, 1, 86_400_000),
  API_RATE_LIMIT_MAX_REQUESTS: createIntegerWithDefault(
    DEFAULT_API_RATE_LIMIT_MAX_REQUESTS,
    1,
    1_000_000,
  ),
  SWAGGER_ENABLED: createBooleanWithDefault(true),
  SWAGGER_PATH: pathSchema(DEFAULT_SWAGGER_PATH),
  OPENAPI_JSON_PATH: pathSchema(DEFAULT_OPENAPI_JSON_PATH),
  PUBLIC_APP_URL: z.preprocess(normalizeBlankString, webUrlSchema.default(DEFAULT_PUBLIC_APP_URL)),
});

export const trackerEnvironmentSchema = baseServiceEnvironmentSchema.extend({
  TRACKER_HOST: createStringWithDefault(DEFAULT_TRACKER_HOST),
  TRACKER_PORT: createIntegerWithDefault(DEFAULT_TRACKER_PORT, 1, 65_535),
  TRUST_PROXY: createBooleanWithDefault(false),
  REQUEST_BODY_LIMIT: requestBodyLimitSchema,
  TRACKER_RATE_LIMIT_WINDOW_MS: createIntegerWithDefault(
    DEFAULT_RATE_LIMIT_WINDOW_MS,
    1,
    86_400_000,
  ),
  TRACKER_RATE_LIMIT_MAX_REQUESTS: createIntegerWithDefault(
    DEFAULT_TRACKER_RATE_LIMIT_MAX_REQUESTS,
    1,
    10_000_000,
  ),
});

export const workerEnvironmentSchema = baseServiceEnvironmentSchema.extend({
  REDIS_URL: z.preprocess(normalizeBlankString, redisUrlSchema.default(DEFAULT_REDIS_URL)),
  QUEUE_PREFIX: createStringWithDefault(DEFAULT_QUEUE_PREFIX),
  WORKER_CONCURRENCY: createIntegerWithDefault(DEFAULT_WORKER_CONCURRENCY, 1, 100),
  QUEUE_JOB_ATTEMPTS: createIntegerWithDefault(DEFAULT_QUEUE_JOB_ATTEMPTS, 1, 20),
  QUEUE_JOB_BACKOFF_MS: createIntegerWithDefault(DEFAULT_QUEUE_JOB_BACKOFF_MS, 1, 86_400_000),
});

export const supabaseEnvironmentSchema = z.object({
  SUPABASE_URL: webUrlSchema,
  SUPABASE_PUBLISHABLE_KEY: nonEmptyStringSchema,
  SUPABASE_SECRET_KEY: nonEmptyStringSchema,
});

export const databaseEnvironmentSchema = z
  .object({
    DATABASE_URL_RUNTIME: postgresUrlSchema,
    DATABASE_URL_MIGRATIONS: postgresUrlSchema,
    DATABASE_POOL_MIN: createIntegerWithDefault(DEFAULT_DATABASE_POOL_MIN, 0, 100),
    DATABASE_POOL_MAX: createIntegerWithDefault(DEFAULT_DATABASE_POOL_MAX, 1, 500),
    DATABASE_QUERY_TIMEOUT_MS: createIntegerWithDefault(
      DEFAULT_DATABASE_QUERY_TIMEOUT_MS,
      1,
      300_000,
    ),
  })
  .refine((configuration) => configuration.DATABASE_POOL_MIN <= configuration.DATABASE_POOL_MAX, {
    message: 'DATABASE_POOL_MIN cannot exceed DATABASE_POOL_MAX.',
    path: ['DATABASE_POOL_MIN'],
  });

export const securityEnvironmentSchema = z.object({
  INTERNAL_SERVICE_SIGNING_SECRET: secretSchema,
  DATA_ENCRYPTION_KEY: secretSchema,
  IP_HASH_SECRET: secretSchema,
  VISITOR_ID_SIGNING_SECRET: secretSchema,
});

export const trackingEnvironmentSchema = z.object({
  TRACKING_ROOT_DOMAIN: z
    .string()
    .trim()
    .regex(hostnamePattern, 'TRACKING_ROOT_DOMAIN must be a valid hostname.'),
  POSTBACK_ROOT_DOMAIN: z
    .string()
    .trim()
    .regex(hostnamePattern, 'POSTBACK_ROOT_DOMAIN must be a valid hostname.'),
  TRACKING_COOKIE_NAME: z.preprocess(
    normalizeBlankString,
    z
      .string()
      .trim()
      .regex(cookieNamePattern, 'Tracking cookie name contains invalid characters.')
      .default(DEFAULT_TRACKING_COOKIE_NAME),
  ),
  TRACKING_COOKIE_MAX_AGE_DAYS: createIntegerWithDefault(
    DEFAULT_TRACKING_COOKIE_MAX_AGE_DAYS,
    1,
    3_650,
  ),
});

export const emailEnvironmentSchema = z.object({
  BREVO_API_KEY: nonEmptyStringSchema,
  BREVO_SENDER_EMAIL: z.preprocess(normalizeBlankString, z.email()),
  BREVO_SENDER_NAME: nonEmptyStringSchema,
});

export type BaseServiceEnvironment = z.infer<typeof baseServiceEnvironmentSchema>;
export type ApiEnvironment = z.infer<typeof apiEnvironmentSchema>;
export type TrackerEnvironment = z.infer<typeof trackerEnvironmentSchema>;
export type WorkerEnvironment = z.infer<typeof workerEnvironmentSchema>;
export type SupabaseEnvironment = z.infer<typeof supabaseEnvironmentSchema>;
export type DatabaseEnvironment = z.infer<typeof databaseEnvironmentSchema>;
export type SecurityEnvironment = z.infer<typeof securityEnvironmentSchema>;
export type TrackingEnvironment = z.infer<typeof trackingEnvironmentSchema>;
export type EmailEnvironment = z.infer<typeof emailEnvironmentSchema>;
