import process from 'node:process';

import {
  apiEnvironmentSchema,
  databaseEnvironmentSchema,
  parseEnvironment,
  securityEnvironmentSchema,
  supabaseEnvironmentSchema,
  type ApiEnvironment,
  type DatabaseEnvironment,
  type EnvironmentSource,
  type SecurityEnvironment,
  type SupabaseEnvironment,
} from '@affiliate-tracker/config';

type ApiDatabaseEnvironment = Pick<
  DatabaseEnvironment,
  'DATABASE_POOL_MAX' | 'DATABASE_POOL_MIN' | 'DATABASE_QUERY_TIMEOUT_MS' | 'DATABASE_URL_RUNTIME'
>;

type ApiSupabaseEnvironment = Pick<
  SupabaseEnvironment,
  'SUPABASE_PUBLISHABLE_KEY' | 'SUPABASE_SECRET_KEY' | 'SUPABASE_URL'
>;

type ApiSecurityEnvironment = Pick<SecurityEnvironment, 'DATA_ENCRYPTION_KEY'>;

type ApiRuntimeEnvironment = ApiEnvironment &
  ApiDatabaseEnvironment &
  ApiSupabaseEnvironment &
  ApiSecurityEnvironment;

const apiRuntimeEnvironmentSchema = apiEnvironmentSchema
  .extend({
    DATABASE_URL_RUNTIME: databaseEnvironmentSchema.shape.DATABASE_URL_RUNTIME,
    DATABASE_POOL_MIN: databaseEnvironmentSchema.shape.DATABASE_POOL_MIN,
    DATABASE_POOL_MAX: databaseEnvironmentSchema.shape.DATABASE_POOL_MAX,
    DATABASE_QUERY_TIMEOUT_MS: databaseEnvironmentSchema.shape.DATABASE_QUERY_TIMEOUT_MS,
    SUPABASE_URL: supabaseEnvironmentSchema.shape.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: supabaseEnvironmentSchema.shape.SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: supabaseEnvironmentSchema.shape.SUPABASE_SECRET_KEY,
    DATA_ENCRYPTION_KEY: securityEnvironmentSchema.shape.DATA_ENCRYPTION_KEY,
  })
  .refine((configuration) => configuration.DATABASE_POOL_MIN <= configuration.DATABASE_POOL_MAX, {
    message: 'DATABASE_POOL_MIN cannot exceed DATABASE_POOL_MAX.',
    path: ['DATABASE_POOL_MIN'],
  })
  .superRefine((configuration, context) => {
    const values = [
      configuration.RENDER_API_KEY,
      configuration.RENDER_TRACKER_SERVICE_ID,
      configuration.RENDER_TRACKER_SERVICE_HOSTNAME,
    ];
    const configuredCount = values.filter((value) => value !== undefined).length;

    if (configuredCount !== 0 && configuredCount !== values.length) {
      context.addIssue({
        code: 'custom',
        message:
          'RENDER_API_KEY, RENDER_TRACKER_SERVICE_ID, and RENDER_TRACKER_SERVICE_HOSTNAME must be configured together.',
        path: ['RENDER_API_KEY'],
      });
    }
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
  readonly frontend: {
    readonly publicUrl: string;
  };
  readonly customDomains: {
    readonly enabled: boolean;
    readonly renderApiKey: string | null;
    readonly renderServiceId: string | null;
    readonly renderServiceHostname: string | null;
    readonly tlsTimeoutMs: number;
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
  readonly security: {
    readonly dataEncryptionKey: string;
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
    readonly secretKey: string;
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
    frontend: Object.freeze({
      publicUrl: environment.PUBLIC_APP_URL.replace(/\/+$/u, ''),
    }),
    customDomains: Object.freeze({
      enabled:
        environment.RENDER_API_KEY !== undefined &&
        environment.RENDER_TRACKER_SERVICE_ID !== undefined &&
        environment.RENDER_TRACKER_SERVICE_HOSTNAME !== undefined,
      renderApiKey: environment.RENDER_API_KEY ?? null,
      renderServiceId: environment.RENDER_TRACKER_SERVICE_ID ?? null,
      renderServiceHostname: environment.RENDER_TRACKER_SERVICE_HOSTNAME ?? null,
      tlsTimeoutMs: environment.CUSTOM_DOMAIN_TLS_TIMEOUT_MS,
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
    security: Object.freeze({
      dataEncryptionKey: environment.DATA_ENCRYPTION_KEY,
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
      secretKey: environment.SUPABASE_SECRET_KEY,
    }),
  });
}

export function loadApiConfig(environment: EnvironmentSource = process.env): ApiRuntimeConfig {
  const validatedEnvironment = parseEnvironment(apiRuntimeEnvironmentSchema, environment);

  return createApiRuntimeConfig(validatedEnvironment);
}
