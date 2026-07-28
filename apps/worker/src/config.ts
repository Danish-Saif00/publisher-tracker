import process from 'node:process';

import {
  databaseEnvironmentSchema,
  emailEnvironmentSchema,
  parseEnvironment,
  securityEnvironmentSchema,
  workerEnvironmentSchema,
  type DatabaseEnvironment,
  type EmailEnvironment,
  type EnvironmentSource,
  type SecurityEnvironment,
  type WorkerEnvironment,
} from '@affiliate-tracker/config';

const BREVO_REQUEST_TIMEOUT_MS = 15_000;

type WorkerDatabaseEnvironment = Pick<
  DatabaseEnvironment,
  | 'DATABASE_POOL_MAX'
  | 'DATABASE_POOL_MIN'
  | 'DATABASE_QUERY_TIMEOUT_MS'
  | 'DATABASE_URL_RUNTIME'
>;

type WorkerEmailEnvironment = Pick<
  EmailEnvironment,
  'BREVO_API_KEY' | 'BREVO_SENDER_EMAIL' | 'BREVO_SENDER_NAME'
>;

type WorkerSecurityEnvironment = Pick<
  SecurityEnvironment,
  'DATA_ENCRYPTION_KEY'
>;

type WorkerRuntimeEnvironment =
  WorkerEnvironment &
  WorkerDatabaseEnvironment &
  WorkerEmailEnvironment &
  WorkerSecurityEnvironment;

const workerRuntimeEnvironmentSchema = workerEnvironmentSchema
  .extend({
    DATABASE_URL_RUNTIME: databaseEnvironmentSchema.shape.DATABASE_URL_RUNTIME,
    DATABASE_POOL_MIN: databaseEnvironmentSchema.shape.DATABASE_POOL_MIN,
    DATABASE_POOL_MAX: databaseEnvironmentSchema.shape.DATABASE_POOL_MAX,
    DATABASE_QUERY_TIMEOUT_MS: databaseEnvironmentSchema.shape.DATABASE_QUERY_TIMEOUT_MS,
    BREVO_API_KEY: emailEnvironmentSchema.shape.BREVO_API_KEY,
    BREVO_SENDER_EMAIL: emailEnvironmentSchema.shape.BREVO_SENDER_EMAIL,
    BREVO_SENDER_NAME: emailEnvironmentSchema.shape.BREVO_SENDER_NAME,
    DATA_ENCRYPTION_KEY: securityEnvironmentSchema.shape.DATA_ENCRYPTION_KEY,
  })
  .refine(
    (configuration) => configuration.DATABASE_POOL_MIN <= configuration.DATABASE_POOL_MAX,
    {
      message: 'DATABASE_POOL_MIN cannot exceed DATABASE_POOL_MAX.',
      path: ['DATABASE_POOL_MIN'],
    },
  );

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
  readonly email: {
    readonly apiKey: string;
    readonly senderEmail: string;
    readonly senderName: string;
    readonly requestTimeoutMs: number;
  };
  readonly security: {
    readonly dataEncryptionKey: string;
  };
}

function createWorkerRuntimeConfig(
  environment: WorkerRuntimeEnvironment,
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
    email: Object.freeze({
      apiKey: environment.BREVO_API_KEY,
      senderEmail: environment.BREVO_SENDER_EMAIL,
      senderName: environment.BREVO_SENDER_NAME,
      requestTimeoutMs: BREVO_REQUEST_TIMEOUT_MS,
    }),
    security: Object.freeze({
      dataEncryptionKey: environment.DATA_ENCRYPTION_KEY,
    }),
  });
}

export function loadWorkerConfig(
  environment: EnvironmentSource = process.env,
): WorkerRuntimeConfig {
  return createWorkerRuntimeConfig(
    parseEnvironment(workerRuntimeEnvironmentSchema, environment),
  );
}
