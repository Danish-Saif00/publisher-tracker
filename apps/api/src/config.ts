import process from 'node:process';

import {
  apiEnvironmentSchema,
  databaseEnvironmentSchema,
  parseEnvironment,
  supabaseEnvironmentSchema,
  type ApiEnvironment,
  type DatabaseEnvironment,
  type EnvironmentSource,
  type SupabaseEnvironment,
} from '@affiliate-tracker/config';

type ApiDatabaseEnvironment = Pick<
  DatabaseEnvironment,
  'DATABASE_POOL_MAX' | 'DATABASE_POOL_MIN' | 'DATABASE_QUERY_TIMEOUT_MS' | 'DATABASE_URL_RUNTIME'
>;

type ApiSupabaseEnvironment = Pick<
  SupabaseEnvironment,
  'SUPABASE_PUBLISHABLE_KEY' | 'SUPABASE_URL'
>;

type ApiRuntimeEnvironment = ApiEnvironment & ApiDatabaseEnvironment & ApiSupabaseEnvironment;

const apiRuntimeEnvironmentSchema = apiEnvironmentSchema
  .extend({
    DATABASE_URL_RUNTIME: databaseEnvironmentSchema.shape.DATABASE_URL_RUNTIME,
    DATABASE_POOL_MIN: databaseEnvironmentSchema.shape.DATABASE_POOL_MIN,
    DATABASE_POOL_MAX: databaseEnvironmentSchema.shape.DATABASE_POOL_MAX,
    DATABASE_QUERY_TIMEOUT_MS: databaseEnvironmentSchema.shape.DATABASE_QUERY_TIMEOUT_MS,
    SUPABASE_URL: supabaseEnvironmentSchema.shape.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: supabaseEnvironmentSchema.shape.SUPABASE_PUBLISHABLE_KEY,
  })
  .refine((configuration) => configuration.DATABASE_POOL_MIN <= configuration.DATABASE_POOL_MAX, {
    message: 'DATABASE_POOL_MIN cannot exceed DATABASE_POOL_MAX.',
    path: ['DATABASE_POOL_MIN'],
  });

export interface ApiRuntimeConfig {
  readonly application: {
    readonly environment: ApiEnvironment['APP_ENV'];
    readonly logLevel: ApiEnvironment['LOG_LEVEL'];
    readonly prettyLogs: boolean;
  };
  readonly server: {
    readonly host: string;
    readonly port: number;
    readonly basePath: string;
    readonly trustProxy: boolean;
    readonly requestBodyLimit: string;
  };
  readonly cors: {
    readonly allowedOrigins: readonly string[];
  };
  readonly rateLimit: {
    readonly windowMs: number;
    readonly maxRequests: number;
  };
  readonly swagger: {
    readonly enabled: boolean;
    readonly documentationPath: string;
    readonly openApiJsonPath: string;
  };
  readonly database: {
    readonly connectionString: string;
    readonly minConnections: number;
    readonly maxConnections: number;
    readonly queryTimeoutMs: number;
  };
  readonly authentication: {
    readonly supabaseUrl: string;
    readonly publishableKey: string;
  };
}

function createApiRuntimeConfig(environment: ApiRuntimeEnvironment): ApiRuntimeConfig {
  return Object.freeze({
    application: Object.freeze({
      environment: environment.APP_ENV,
      logLevel: environment.LOG_LEVEL,
      prettyLogs: environment.LOG_PRETTY,
    }),
    server: Object.freeze({
      host: environment.API_HOST,
      port: environment.API_PORT,
      basePath: environment.API_BASE_PATH,
      trustProxy: environment.TRUST_PROXY,
      requestBodyLimit: environment.REQUEST_BODY_LIMIT,
    }),
    cors: Object.freeze({
      allowedOrigins: Object.freeze([...environment.CORS_ALLOWED_ORIGINS]),
    }),
    rateLimit: Object.freeze({
      windowMs: environment.API_RATE_LIMIT_WINDOW_MS,
      maxRequests: environment.API_RATE_LIMIT_MAX_REQUESTS,
    }),
    swagger: Object.freeze({
      enabled: environment.SWAGGER_ENABLED,
      documentationPath: environment.SWAGGER_PATH,
      openApiJsonPath: environment.OPENAPI_JSON_PATH,
    }),
    database: Object.freeze({
      connectionString: environment.DATABASE_URL_RUNTIME,
      minConnections: environment.DATABASE_POOL_MIN,
      maxConnections: environment.DATABASE_POOL_MAX,
      queryTimeoutMs: environment.DATABASE_QUERY_TIMEOUT_MS,
    }),
    authentication: Object.freeze({
      supabaseUrl: environment.SUPABASE_URL,
      publishableKey: environment.SUPABASE_PUBLISHABLE_KEY,
    }),
  });
}

export function loadApiConfig(environment: EnvironmentSource = process.env): ApiRuntimeConfig {
  const validatedEnvironment = parseEnvironment(apiRuntimeEnvironmentSchema, environment);

  return createApiRuntimeConfig(validatedEnvironment);
}
