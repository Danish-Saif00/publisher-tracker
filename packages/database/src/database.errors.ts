export type DatabaseErrorCode =
  | 'DATABASE_CONNECTION_FAILED'
  | 'DATABASE_HEALTH_CHECK_FAILED'
  | 'DATABASE_QUERY_FAILED'
  | 'DATABASE_TRANSACTION_FAILED'
  | 'DATABASE_SHUTDOWN_FAILED';

export type DatabaseOperation = 'connect' | 'health-check' | 'query' | 'transaction' | 'shutdown';

export interface DatabaseErrorOptions {
  readonly cause?: unknown;
  readonly code: DatabaseErrorCode;
  readonly operation: DatabaseOperation;
  readonly retriable?: boolean;
}

export interface DatabaseFailureOptions {
  readonly cause?: unknown;
  readonly retriable?: boolean;
}

function normalizeErrorMessage(message: string): string {
  const normalizedMessage = message.trim();

  return normalizedMessage.length > 0 ? normalizedMessage : 'Database operation failed.';
}

function createNativeErrorOptions(cause: unknown): ErrorOptions | undefined {
  return cause === undefined
    ? undefined
    : {
        cause,
      };
}

export class DatabaseError extends Error {
  public readonly code: DatabaseErrorCode;
  public readonly operation: DatabaseOperation;
  public readonly retriable: boolean;

  public constructor(message: string, options: DatabaseErrorOptions) {
    super(normalizeErrorMessage(message), createNativeErrorOptions(options.cause));

    this.name = 'DatabaseError';
    this.code = options.code;
    this.operation = options.operation;
    this.retriable = options.retriable ?? false;
  }
}

export class DatabaseConnectionError extends DatabaseError {
  public constructor(message: string, options: DatabaseFailureOptions = {}) {
    super(message, {
      code: 'DATABASE_CONNECTION_FAILED',
      operation: 'connect',
      retriable: options.retriable ?? true,
      ...(options.cause !== undefined
        ? {
            cause: options.cause,
          }
        : {}),
    });

    this.name = 'DatabaseConnectionError';
  }
}

export class DatabaseHealthCheckError extends DatabaseError {
  public constructor(message: string, options: DatabaseFailureOptions = {}) {
    super(message, {
      code: 'DATABASE_HEALTH_CHECK_FAILED',
      operation: 'health-check',
      retriable: options.retriable ?? true,
      ...(options.cause !== undefined
        ? {
            cause: options.cause,
          }
        : {}),
    });

    this.name = 'DatabaseHealthCheckError';
  }
}

export class DatabaseQueryError extends DatabaseError {
  public constructor(message: string, options: DatabaseFailureOptions = {}) {
    super(message, {
      code: 'DATABASE_QUERY_FAILED',
      operation: 'query',
      retriable: options.retriable ?? false,
      ...(options.cause !== undefined
        ? {
            cause: options.cause,
          }
        : {}),
    });

    this.name = 'DatabaseQueryError';
  }
}

export class DatabaseTransactionError extends DatabaseError {
  public constructor(message: string, options: DatabaseFailureOptions = {}) {
    super(message, {
      code: 'DATABASE_TRANSACTION_FAILED',
      operation: 'transaction',
      retriable: options.retriable ?? false,
      ...(options.cause !== undefined
        ? {
            cause: options.cause,
          }
        : {}),
    });

    this.name = 'DatabaseTransactionError';
  }
}

export class DatabaseShutdownError extends DatabaseError {
  public constructor(message: string, options: DatabaseFailureOptions = {}) {
    super(message, {
      code: 'DATABASE_SHUTDOWN_FAILED',
      operation: 'shutdown',
      retriable: options.retriable ?? true,
      ...(options.cause !== undefined
        ? {
            cause: options.cause,
          }
        : {}),
    });

    this.name = 'DatabaseShutdownError';
  }
}
