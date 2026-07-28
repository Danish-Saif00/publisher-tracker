import { serializeError, type ObservabilityLogger } from '@affiliate-tracker/observability';
import { Pool } from 'pg';
import type { PoolClient, QueryConfig, QueryResult, QueryResultRow } from 'pg';

import {
  DatabaseConnectionError,
  DatabaseError,
  DatabaseHealthCheckError,
  DatabaseQueryError,
  DatabaseShutdownError,
  DatabaseTransactionError,
} from './database.errors.js';
import type {
  CreateDatabaseOptions,
  DatabaseExecutionContext,
  DatabaseQuery,
  DatabaseRuntime,
  DatabaseTransaction,
  DatabaseTransactionCallback,
  DatabaseTransactionIsolationLevel,
  DatabaseTransactionOptions,
} from './database.types.js';

const HEALTH_CHECK_QUERY_NAME = 'database-health-check';
const HEALTH_CHECK_QUERY_TEXT = 'SELECT 1 AS healthy';
const SESSION_CONTEXT_QUERY_TEXT = 'SELECT set_config($1, $2, true)';

const TRANSACTION_ISOLATION_SQL: Readonly<Record<DatabaseTransactionIsolationLevel, string>> = {
  'read committed': 'READ COMMITTED',
  'repeatable read': 'REPEATABLE READ',
  serializable: 'SERIALIZABLE',
};

const RETRIABLE_POSTGRES_ERROR_CODES: ReadonlySet<string> = new Set([
  '08000',
  '08001',
  '08003',
  '08004',
  '08006',
  '08007',
  '08P01',
  '40001',
  '40P01',
  '53300',
  '57P01',
  '57P02',
  '57P03',
]);

type TransactionPhase = 'begin' | 'session-context' | 'callback' | 'commit';

type SessionContextSetting = readonly [settingName: string, value: string | undefined];

interface ValidatedDatabaseOptions {
  readonly applicationName: string;
  readonly connectionString: string;
  readonly maxConnections: number;
  readonly minConnections: number;
  readonly queryTimeoutMs: number;
}

interface PgQueryExecutor {
  query<TRow extends QueryResultRow = QueryResultRow>(
    queryConfig: QueryConfig,
  ): Promise<QueryResult<TRow>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRetriablePostgresError(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }

  const errorCode = error['code'];

  return typeof errorCode === 'string' && RETRIABLE_POSTGRES_ERROR_CODES.has(errorCode);
}

function normalizeRequiredString(value: string, fieldName: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw new DatabaseConnectionError(`${fieldName} cannot be empty.`, {
      retriable: false,
    });
  }

  return normalizedValue;
}

function validateInteger(value: number, fieldName: string, minimumValue: number): void {
  if (!Number.isInteger(value) || value < minimumValue) {
    throw new DatabaseConnectionError(
      `${fieldName} must be an integer greater than or equal to ${String(minimumValue)}.`,
      {
        retriable: false,
      },
    );
  }
}

function validateCreateDatabaseOptions(options: CreateDatabaseOptions): ValidatedDatabaseOptions {
  const applicationName = normalizeRequiredString(
    options.applicationName,
    'Database application name',
  );
  const connectionString = normalizeRequiredString(
    options.connectionString,
    'Database connection string',
  );

  validateInteger(options.minConnections, 'Minimum database connections', 0);
  validateInteger(options.maxConnections, 'Maximum database connections', 1);
  validateInteger(options.queryTimeoutMs, 'Database query timeout', 1);

  if (options.minConnections > options.maxConnections) {
    throw new DatabaseConnectionError(
      'Minimum database connections cannot exceed maximum database connections.',
      {
        retriable: false,
      },
    );
  }

  return {
    applicationName,
    connectionString,
    minConnections: options.minConnections,
    maxConnections: options.maxConnections,
    queryTimeoutMs: options.queryTimeoutMs,
  };
}

function createPgQueryConfig(query: DatabaseQuery): QueryConfig {
  const queryText = query.text.trim();

  if (queryText.length === 0) {
    throw new DatabaseQueryError('Database query text cannot be empty.', {
      retriable: false,
    });
  }

  const queryName = query.name?.trim();

  if (queryName?.length === 0) {
    throw new DatabaseQueryError('Database query name cannot be empty when provided.', {
      retriable: false,
    });
  }

  return {
    text: queryText,
    ...(queryName !== undefined
      ? {
          name: queryName,
        }
      : {}),
    ...(query.values !== undefined
      ? {
          values: [...query.values],
        }
      : {}),
  };
}

function createDatabaseQueryError(error: unknown): DatabaseQueryError {
  if (error instanceof DatabaseQueryError) {
    return error;
  }

  return new DatabaseQueryError('Database query execution failed.', {
    cause: error,
    retriable: isRetriablePostgresError(error),
  });
}

async function executeDatabaseQuery<TRow extends QueryResultRow = QueryResultRow>(
  executor: PgQueryExecutor,
  query: DatabaseQuery,
  logger: ObservabilityLogger,
): Promise<QueryResult<TRow>> {
  let queryConfig: QueryConfig;

  try {
    queryConfig = createPgQueryConfig(query);
  } catch (error: unknown) {
    const databaseError = createDatabaseQueryError(error);

    logger.error(
      {
        databaseErrorCode: databaseError.code,
        error: serializeError(databaseError),
        queryName: query.name ?? null,
        retriable: databaseError.retriable,
      },
      'Database query validation failed.',
    );

    throw databaseError;
  }

  try {
    return await executor.query<TRow>(queryConfig);
  } catch (error: unknown) {
    const databaseError = createDatabaseQueryError(error);

    logger.error(
      {
        databaseErrorCode: databaseError.code,
        error: serializeError(databaseError),
        queryName: queryConfig.name ?? null,
        retriable: databaseError.retriable,
      },
      'Database query execution failed.',
    );

    throw databaseError;
  }
}

function normalizeContextValue(value: string | undefined, fieldName: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw new DatabaseTransactionError(`${fieldName} cannot be empty when provided.`, {
      retriable: false,
    });
  }

  return normalizedValue;
}

function normalizeExecutionContext(
  context: DatabaseExecutionContext | undefined,
): DatabaseExecutionContext | undefined {
  if (context === undefined) {
    return undefined;
  }

  const actorUserId = normalizeContextValue(context.actorUserId, 'Database actor user ID');
  const companyId = normalizeContextValue(context.companyId, 'Database company ID');
  const requestId = normalizeContextValue(context.requestId, 'Database request ID');

  if (actorUserId === undefined && companyId === undefined && requestId === undefined) {
    return undefined;
  }

  return Object.freeze({
    ...(actorUserId !== undefined
      ? {
          actorUserId,
        }
      : {}),
    ...(companyId !== undefined
      ? {
          companyId,
        }
      : {}),
    ...(requestId !== undefined
      ? {
          requestId,
        }
      : {}),
  });
}

function createBeginStatement(options: DatabaseTransactionOptions | undefined): string {
  const isolationLevel = options?.isolationLevel;

  if (
    options?.deferrable === true &&
    (isolationLevel !== 'serializable' || options.readOnly !== true)
  ) {
    throw new DatabaseTransactionError(
      'Deferrable transactions require serializable isolation and read-only mode.',
      {
        retriable: false,
      },
    );
  }

  const clauses = ['BEGIN'];

  if (isolationLevel !== undefined) {
    clauses.push(`ISOLATION LEVEL ${TRANSACTION_ISOLATION_SQL[isolationLevel]}`);
  }

  if (options?.readOnly === true) {
    clauses.push('READ ONLY');
  }

  if (options?.deferrable === true) {
    clauses.push('DEFERRABLE');
  }

  return clauses.join(' ');
}

async function applySessionContext(
  client: PoolClient,
  context: DatabaseExecutionContext | undefined,
): Promise<void> {
  if (context === undefined) {
    return;
  }

  const settings: readonly SessionContextSetting[] = [
    ['app.current_actor_user_id', context.actorUserId],
    ['app.current_company_id', context.companyId],
    ['app.current_request_id', context.requestId],
  ];

  for (const [settingName, value] of settings) {
    if (value === undefined) {
      continue;
    }

    await client.query({
      text: SESSION_CONTEXT_QUERY_TEXT,
      values: [settingName, value],
    });
  }
}

function createTransactionExecutor(
  client: PoolClient,
  logger: ObservabilityLogger,
  sessionContext: DatabaseExecutionContext | undefined,
): DatabaseTransaction {
  return {
    ...(sessionContext !== undefined
      ? {
          sessionContext,
        }
      : {}),

    query<TRow extends QueryResultRow = QueryResultRow>(
      query: DatabaseQuery,
    ): Promise<QueryResult<TRow>> {
      return executeDatabaseQuery<TRow>(client, query, logger);
    },
  };
}

function createTransactionPhaseMessage(phase: Exclude<TransactionPhase, 'callback'>): string {
  switch (phase) {
    case 'begin':
      return 'Database transaction could not start.';

    case 'session-context':
      return 'Database transaction session context could not be applied.';

    case 'commit':
      return 'Database transaction could not commit.';
  }
}

async function acquirePoolClient(pool: Pool, logger: ObservabilityLogger): Promise<PoolClient> {
  try {
    return await pool.connect();
  } catch (error: unknown) {
    const databaseError = new DatabaseConnectionError(
      'Unable to acquire a PostgreSQL connection from the pool.',
      {
        cause: error,
        retriable: isRetriablePostgresError(error),
      },
    );

    logger.error(
      {
        databaseErrorCode: databaseError.code,
        error: serializeError(databaseError),
        retriable: databaseError.retriable,
      },
      'Database pool connection acquisition failed.',
    );

    throw databaseError;
  }
}

async function executeDatabaseTransaction<TResult>(
  pool: Pool,
  logger: ObservabilityLogger,
  callback: DatabaseTransactionCallback<TResult>,
  options: DatabaseTransactionOptions | undefined,
): Promise<TResult> {
  const beginStatement = createBeginStatement(options);
  const sessionContext = normalizeExecutionContext(options?.sessionContext);
  const client = await acquirePoolClient(pool, logger);

  let phase: TransactionPhase = 'begin';
  let transactionStarted = false;
  let discardClient = false;

  try {
    await client.query(beginStatement);
    transactionStarted = true;

    phase = 'session-context';
    await applySessionContext(client, sessionContext);

    phase = 'callback';

    const result = await callback(createTransactionExecutor(client, logger, sessionContext));

    phase = 'commit';
    await client.query('COMMIT');

    transactionStarted = false;

    return result;
  } catch (error: unknown) {
    let rollbackError: unknown;
    discardClient = phase !== 'callback';

    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (caughtRollbackError: unknown) {
        rollbackError = caughtRollbackError;
        discardClient = true;
      }
    }

    if (rollbackError !== undefined) {
      const databaseError = new DatabaseTransactionError(
        'Database transaction and rollback both failed.',
        {
          cause: new AggregateError(
            [error, rollbackError],
            'Database transaction and rollback both failed.',
          ),
          retriable: isRetriablePostgresError(error) || isRetriablePostgresError(rollbackError),
        },
      );

      logger.error(
        {
          databaseErrorCode: databaseError.code,
          error: serializeError(databaseError),
          phase,
          retriable: databaseError.retriable,
        },
        'Database transaction rollback failed.',
      );

      throw databaseError;
    }

    if (phase === 'callback') {
      throw error;
    }

    if (error instanceof DatabaseError) {
      throw error;
    }

    const databaseError = new DatabaseTransactionError(createTransactionPhaseMessage(phase), {
      cause: error,
      retriable: isRetriablePostgresError(error),
    });

    logger.error(
      {
        databaseErrorCode: databaseError.code,
        error: serializeError(databaseError),
        phase,
        retriable: databaseError.retriable,
      },
      'Database transaction operation failed.',
    );

    throw databaseError;
  } finally {
    client.release(discardClient);
  }
}

async function checkDatabaseHealth(pool: Pool, logger: ObservabilityLogger): Promise<void> {
  try {
    await pool.query({
      name: HEALTH_CHECK_QUERY_NAME,
      text: HEALTH_CHECK_QUERY_TEXT,
    });
  } catch (error: unknown) {
    const databaseError = new DatabaseHealthCheckError('PostgreSQL health check failed.', {
      cause: error,
      retriable: isRetriablePostgresError(error),
    });

    logger.error(
      {
        databaseErrorCode: databaseError.code,
        error: serializeError(databaseError),
        retriable: databaseError.retriable,
      },
      'Database health check failed.',
    );

    throw databaseError;
  }
}

async function closeDatabasePool(pool: Pool, logger: ObservabilityLogger): Promise<void> {
  logger.info(
    {
      idleConnections: pool.idleCount,
      totalConnections: pool.totalCount,
      waitingRequests: pool.waitingCount,
    },
    'Database pool shutdown started.',
  );

  try {
    await pool.end();

    logger.info('Database pool shutdown completed.');
  } catch (error: unknown) {
    const databaseError = new DatabaseShutdownError(
      'PostgreSQL connection pool failed to shut down cleanly.',
      {
        cause: error,
        retriable: true,
      },
    );

    logger.error(
      {
        databaseErrorCode: databaseError.code,
        error: serializeError(databaseError),
        retriable: databaseError.retriable,
      },
      'Database pool shutdown failed.',
    );

    throw databaseError;
  }
}

export function createDatabase(options: CreateDatabaseOptions): DatabaseRuntime {
  const validatedOptions = validateCreateDatabaseOptions(options);

  const logger = options.logger.child({
    applicationName: validatedOptions.applicationName,
    component: 'database',
  });

  const pool = new Pool({
    application_name: validatedOptions.applicationName,
    connectionString: validatedOptions.connectionString,
    max: validatedOptions.maxConnections,
    min: validatedOptions.minConnections,
    query_timeout: validatedOptions.queryTimeoutMs,
    statement_timeout: validatedOptions.queryTimeoutMs,
  });

  let shutdownPromise: Promise<void> | undefined;

  pool.on('error', (error) => {
    logger.error(
      {
        error: serializeError(error),
        idleConnections: pool.idleCount,
        totalConnections: pool.totalCount,
        waitingRequests: pool.waitingCount,
      },
      'PostgreSQL pool emitted an idle-client error.',
    );
  });

  return {
    query<TRow extends QueryResultRow = QueryResultRow>(
      query: DatabaseQuery,
    ): Promise<QueryResult<TRow>> {
      if (shutdownPromise !== undefined) {
        return Promise.reject(
          new DatabaseQueryError('Database query rejected because the runtime is shutting down.', {
            retriable: false,
          }),
        );
      }

      return executeDatabaseQuery<TRow>(pool, query, logger);
    },

    checkHealth(): Promise<void> {
      if (shutdownPromise !== undefined) {
        return Promise.reject(
          new DatabaseHealthCheckError(
            'Database health check rejected because the runtime is shutting down.',
            {
              retriable: false,
            },
          ),
        );
      }

      return checkDatabaseHealth(pool, logger);
    },

    transaction<TResult>(
      callback: DatabaseTransactionCallback<TResult>,
      transactionOptions?: DatabaseTransactionOptions,
    ): Promise<TResult> {
      if (shutdownPromise !== undefined) {
        return Promise.reject(
          new DatabaseTransactionError(
            'Database transaction rejected because the runtime is shutting down.',
            {
              retriable: false,
            },
          ),
        );
      }

      return executeDatabaseTransaction(pool, logger, callback, transactionOptions);
    },

    close(): Promise<void> {
      shutdownPromise ??= closeDatabasePool(pool, logger);

      return shutdownPromise;
    },
  };
}
