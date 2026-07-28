import process from 'node:process';

import {
  databaseEnvironmentSchema,
  parseEnvironment,
  workerEnvironmentSchema,
  type DatabaseEnvironment,
  type EnvironmentSource,
  type WorkerEnvironment,
} from '@affiliate-tracker/config';

type WorkerDatabaseEnvironment = Pick<
  DatabaseEnvironment,
  'DATABASE_POOL_MAX' | 'DATABASE_POOL_MIN' | 'DATABASE_QUERY_TIMEOUT_MS' | 'DATABASE_URL_RUNTIME'
>;

type WorkerEnvironmentWithDatabase = WorkerEnvironment & WorkerDatabaseEnvironment;

const workerEnvironmentWithDatabaseSchema = workerEnvironmentSchema
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

export interface WorkerRuntimeConfig {
  readonly application: {
    readonly environment: WorkerEnvironment['APP_ENV'];
    readonly logLevel: WorkerEnvironment['LOG_LEVEL'];
    readonly prettyLogs: boolean;
  };
  readonly redis: {
    readonly url: string;
  };
  readonly queue: {
    readonly prefix: string;
    readonly concurrency: number;
    readonly jobAttempts: number;
    readonly jobBackoffMs: number;
  };
  readonly database: {
    readonly connectionString: string;
    readonly minConnections: number;
    readonly maxConnections: number;
    readonly queryTimeoutMs: number;
  };
}

function createWorkerRuntimeConfig(
  environment: WorkerEnvironmentWithDatabase,
): WorkerRuntimeConfig {
  return Object.freeze({
    application: Object.freeze({
      environment: environment.APP_ENV,
      logLevel: environment.LOG_LEVEL,
      prettyLogs: environment.LOG_PRETTY,
    }),
    redis: Object.freeze({
      url: environment.REDIS_URL,
    }),
    queue: Object.freeze({
      prefix: environment.QUEUE_PREFIX,
      concurrency: environment.WORKER_CONCURRENCY,
      jobAttempts: environment.QUEUE_JOB_ATTEMPTS,
      jobBackoffMs: environment.QUEUE_JOB_BACKOFF_MS,
    }),
    database: Object.freeze({
      connectionString: environment.DATABASE_URL_RUNTIME,
      minConnections: environment.DATABASE_POOL_MIN,
      maxConnections: environment.DATABASE_POOL_MAX,
      queryTimeoutMs: environment.DATABASE_QUERY_TIMEOUT_MS,
    }),
  });
}

export function loadWorkerConfig(
  environment: EnvironmentSource = process.env,
): WorkerRuntimeConfig {
  const validatedEnvironment = parseEnvironment(workerEnvironmentWithDatabaseSchema, environment);

  return createWorkerRuntimeConfig(validatedEnvironment);
}
