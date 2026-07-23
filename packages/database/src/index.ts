export { createDatabase } from './database.js';

export {
  DatabaseConnectionError,
  DatabaseError,
  DatabaseHealthCheckError,
  DatabaseQueryError,
  DatabaseShutdownError,
  DatabaseTransactionError,
} from './database.errors.js';

export type {
  DatabaseErrorCode,
  DatabaseErrorOptions,
  DatabaseFailureOptions,
  DatabaseOperation,
} from './database.errors.js';

export type {
  CreateDatabaseOptions,
  DatabaseExecutionContext,
  DatabaseQuery,
  DatabaseQueryExecutor,
  DatabaseRuntime,
  DatabaseTransaction,
  DatabaseTransactionCallback,
  DatabaseTransactionIsolationLevel,
  DatabaseTransactionOptions,
} from './database.types.js';
