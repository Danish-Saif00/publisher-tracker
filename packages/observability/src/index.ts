import pino from 'pino';
import type { Logger, LoggerOptions } from 'pino';

const REDACTED_VALUE = '[REDACTED]';

const DEFAULT_REDACT_PATHS = [
  'password',
  '*.password',
  'token',
  '*.token',
  'accessToken',
  '*.accessToken',
  'refreshToken',
  '*.refreshToken',
  'apiKey',
  '*.apiKey',
  'secret',
  '*.secret',
  'authorization',
  '*.authorization',
  'cookie',
  '*.cookie',
  'headers.authorization',
  'headers.cookie',
  'headers["set-cookie"]',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'request.headers.authorization',
  'request.headers.cookie',
  'request.headers["set-cookie"]',
  'SUPABASE_SECRET_KEY',
  '*.SUPABASE_SECRET_KEY',
  'BREVO_API_KEY',
  '*.BREVO_API_KEY',
  'INTERNAL_SERVICE_SIGNING_SECRET',
  '*.INTERNAL_SERVICE_SIGNING_SECRET',
  'DATA_ENCRYPTION_KEY',
  '*.DATA_ENCRYPTION_KEY',
  'IP_HASH_SECRET',
  '*.IP_HASH_SECRET',
  'VISITOR_ID_SIGNING_SECRET',
  '*.VISITOR_ID_SIGNING_SECRET',
  'DATABASE_URL_RUNTIME',
  '*.DATABASE_URL_RUNTIME',
  'DATABASE_URL_MIGRATIONS',
  '*.DATABASE_URL_MIGRATIONS',
  'REDIS_URL',
  '*.REDIS_URL',
] as const;

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

export type ServiceEnvironment = 'development' | 'test' | 'production';

export type ObservabilityLogger = Logger;

export interface CreateLoggerOptions {
  readonly service: string;
  readonly environment: ServiceEnvironment;
  readonly level: LogLevel;
  readonly pretty: boolean;
  readonly baseBindings?: Readonly<Record<string, unknown>>;
  readonly redactPaths?: readonly string[];
}

function normalizeServiceName(value: string): string {
  const serviceName = value.trim();

  if (serviceName.length === 0) {
    throw new Error('Logger service name cannot be empty.');
  }

  return serviceName;
}

function createLoggerOptions(options: CreateLoggerOptions): LoggerOptions {
  const redactPaths = [...new Set([...DEFAULT_REDACT_PATHS, ...(options.redactPaths ?? [])])];

  const loggerOptions: LoggerOptions = {
    level: options.level,
    messageKey: 'message',
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: redactPaths,
      censor: REDACTED_VALUE,
    },
    serializers: {
      err: pino.stdSerializers.err,
    },
  };

  if (!options.pretty) {
    return loggerOptions;
  }

  return {
    ...loggerOptions,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        ignore: 'pid,hostname',
        messageKey: 'message',
        singleLine: false,
        translateTime: 'SYS:standard',
      },
    },
  };
}

export function createLogger(options: CreateLoggerOptions): ObservabilityLogger {
  const rootLogger = pino(createLoggerOptions(options));

  const bindings: Record<string, unknown> = {
    ...(options.baseBindings ?? {}),
    service: normalizeServiceName(options.service),
    environment: options.environment,
  };

  return rootLogger.child(bindings);
}

export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack !== undefined ? { stack: error.stack } : {}),
      ...(error.cause !== undefined ? { cause: error.cause } : {}),
    };
  }

  return {
    value: String(error),
  };
}
