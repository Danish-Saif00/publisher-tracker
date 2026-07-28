import process from 'node:process';
import { apiEnvironmentSchema, databaseEnvironmentSchema, parseEnvironment, securityEnvironmentSchema, supabaseEnvironmentSchema, } from '@affiliate-tracker/config';
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
});
function createApiRuntimeConfig(environment) {
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
export function loadApiConfig(environment = process.env) {
    const validatedEnvironment = parseEnvironment(apiRuntimeEnvironmentSchema, environment);
    return createApiRuntimeConfig(validatedEnvironment);
}
//# sourceMappingURL=config.js.map