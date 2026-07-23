import process from 'node:process';

import {
  databaseEnvironmentSchema,
  parseEnvironment,
  trackerEnvironmentSchema,
  type DatabaseEnvironment,
  type EnvironmentSource,
  type TrackerEnvironment,
} from '@affiliate-tracker/config';

type TrackerDatabaseEnvironment = Pick<
  DatabaseEnvironment,
  'DATABASE_POOL_MAX' | 'DATABASE_POOL_MIN' | 'DATABASE_QUERY_TIMEOUT_MS' | 'DATABASE_URL_RUNTIME'
>;

type TrackerEnvironmentWithDatabase = TrackerEnvironment & TrackerDatabaseEnvironment;

const trackerEnvironmentWithDatabaseSchema = trackerEnvironmentSchema
  .extend({
    DATABASE_URL_RUNTIME: databaseEnvironmentSchema.shape.DATABASE_URL_RUNTIME,
    DATABASE_POOL_MIN: databaseEnvironmentSchema.shape.DATABASE_POOL_MIN,
    DATABASE_POOL_MAX: databaseEnvironmentSchema.shape.DATABASE_POOL_MAX,
    DATABASE_QUERY_TIMEOUT_MS: databaseEnvironmentSchema.shape.DATABASE_QUERY_TIMEOUT_MS,
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
}

function createTrackerRuntimeConfig(
  environment: TrackerEnvironmentWithDatabase,
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
  });
}

export function loadTrackerConfig(
  environment: EnvironmentSource = process.env,
): TrackerRuntimeConfig {
  const validatedEnvironment = parseEnvironment(trackerEnvironmentWithDatabaseSchema, environment);

  return createTrackerRuntimeConfig(validatedEnvironment);
}
