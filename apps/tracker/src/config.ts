import process from 'node:process';

import {
  databaseEnvironmentSchema,
  parseEnvironment,
  securityEnvironmentSchema,
  trackerEnvironmentSchema,
  trackingEnvironmentSchema,
  type DatabaseEnvironment,
  type EnvironmentSource,
  type SecurityEnvironment,
  type TrackerEnvironment,
  type TrackingEnvironment,
} from '@affiliate-tracker/config';

type TrackerDatabaseEnvironment = Pick<
  DatabaseEnvironment,
  'DATABASE_POOL_MAX' | 'DATABASE_POOL_MIN' | 'DATABASE_QUERY_TIMEOUT_MS' | 'DATABASE_URL_RUNTIME'
>;

type TrackerSecurityEnvironment = Pick<
  SecurityEnvironment,
  'IP_HASH_SECRET' | 'VISITOR_ID_SIGNING_SECRET'
>;

type TrackerTrackingEnvironment = Pick<
  TrackingEnvironment,
  'TRACKING_COOKIE_MAX_AGE_DAYS' | 'TRACKING_COOKIE_NAME'
>;

type TrackerEnvironmentWithDependencies = TrackerEnvironment &
  TrackerDatabaseEnvironment &
  TrackerSecurityEnvironment &
  TrackerTrackingEnvironment;

const trackerEnvironmentWithDependenciesSchema = trackerEnvironmentSchema
  .extend({
    DATABASE_URL_RUNTIME: databaseEnvironmentSchema.shape.DATABASE_URL_RUNTIME,
    DATABASE_POOL_MIN: databaseEnvironmentSchema.shape.DATABASE_POOL_MIN,
    DATABASE_POOL_MAX: databaseEnvironmentSchema.shape.DATABASE_POOL_MAX,
    DATABASE_QUERY_TIMEOUT_MS: databaseEnvironmentSchema.shape.DATABASE_QUERY_TIMEOUT_MS,
    IP_HASH_SECRET: securityEnvironmentSchema.shape.IP_HASH_SECRET,
    VISITOR_ID_SIGNING_SECRET: securityEnvironmentSchema.shape.VISITOR_ID_SIGNING_SECRET,
    TRACKING_COOKIE_NAME: trackingEnvironmentSchema.shape.TRACKING_COOKIE_NAME,
    TRACKING_COOKIE_MAX_AGE_DAYS: trackingEnvironmentSchema.shape.TRACKING_COOKIE_MAX_AGE_DAYS,
  })
  .refine((configuration) => configuration.DATABASE_POOL_MIN <= configuration.DATABASE_POOL_MAX, {
    message: 'DATABASE_POOL_MIN cannot exceed DATABASE_POOL_MAX.',
    path: ['DATABASE_POOL_MIN'],
  });

export interface TrackerRuntimeConfig {
  readonly application: {
    readonly environment: TrackerEnvironment['APP_ENV'];
    readonly logLevel: TrackerEnvironment['LOG_LEVEL'];
    readonly prettyLogs: boolean;
  };
  readonly server: {
    readonly host: string;
    readonly port: number;
    readonly trustProxy: boolean;
    readonly requestBodyLimit: string;
  };
  readonly rateLimit: {
    readonly windowMs: number;
    readonly maxRequests: number;
  };
  readonly database: {
    readonly connectionString: string;
    readonly minConnections: number;
    readonly maxConnections: number;
    readonly queryTimeoutMs: number;
  };
  readonly security: {
    readonly ipHashSecret: string;
    readonly visitorIdSigningSecret: string;
  };
  readonly tracking: {
    readonly cookieName: string;
    readonly cookieMaxAgeDays: number;
    readonly secureCookies: boolean;
  };
}

function createTrackerRuntimeConfig(
  environment: TrackerEnvironmentWithDependencies,
): TrackerRuntimeConfig {
  return Object.freeze({
    application: Object.freeze({
      environment: environment.APP_ENV,
      logLevel: environment.LOG_LEVEL,
      prettyLogs: environment.LOG_PRETTY,
    }),
    server: Object.freeze({
      host: environment.TRACKER_HOST,
      port: environment.TRACKER_PORT,
      trustProxy: environment.TRUST_PROXY,
      requestBodyLimit: environment.REQUEST_BODY_LIMIT,
    }),
    rateLimit: Object.freeze({
      windowMs: environment.TRACKER_RATE_LIMIT_WINDOW_MS,
      maxRequests: environment.TRACKER_RATE_LIMIT_MAX_REQUESTS,
    }),
    database: Object.freeze({
      connectionString: environment.DATABASE_URL_RUNTIME,
      minConnections: environment.DATABASE_POOL_MIN,
      maxConnections: environment.DATABASE_POOL_MAX,
      queryTimeoutMs: environment.DATABASE_QUERY_TIMEOUT_MS,
    }),
    security: Object.freeze({
      ipHashSecret: environment.IP_HASH_SECRET,
      visitorIdSigningSecret: environment.VISITOR_ID_SIGNING_SECRET,
    }),
    tracking: Object.freeze({
      cookieName: environment.TRACKING_COOKIE_NAME,
      cookieMaxAgeDays: environment.TRACKING_COOKIE_MAX_AGE_DAYS,
      secureCookies: environment.APP_ENV === 'production',
    }),
  });
}

export function loadTrackerConfig(
  environment: EnvironmentSource = process.env,
): TrackerRuntimeConfig {
  const validatedEnvironment = parseEnvironment(
    trackerEnvironmentWithDependenciesSchema,
    environment,
  );

  return createTrackerRuntimeConfig(validatedEnvironment);
}
