import type { ObservabilityLogger } from '@affiliate-tracker/observability';
import type { QueryResult, QueryResultRow } from 'pg';

export type DatabaseTransactionIsolationLevel =
  'read committed' | 'repeatable read' | 'serializable';

export interface CreateDatabaseOptions {
  readonly applicationName: string;
  readonly connectionString: string;
  readonly logger: ObservabilityLogger;
  readonly maxConnections: number;
  readonly minConnections: number;
  readonly queryTimeoutMs: number;
}

export interface DatabaseQuery {
  readonly name?: string;
  readonly text: string;
  readonly values?: readonly unknown[];
}

export interface DatabaseExecutionContext {
  readonly actorUserId?: string;
  readonly companyId?: string;
  readonly requestId?: string;
}

export interface DatabaseTransactionOptions {
  readonly deferrable?: boolean;
  readonly isolationLevel?: DatabaseTransactionIsolationLevel;
  readonly readOnly?: boolean;
  readonly sessionContext?: DatabaseExecutionContext;
}

export interface DatabaseQueryExecutor {
  query<TRow extends QueryResultRow = QueryResultRow>(
    query: DatabaseQuery,
  ): Promise<QueryResult<TRow>>;
}

export interface DatabaseTransaction extends DatabaseQueryExecutor {
  readonly sessionContext?: DatabaseExecutionContext;
}

export type DatabaseTransactionCallback<TResult> = (
  transaction: DatabaseTransaction,
) => Promise<TResult>;

export interface DatabaseRuntime extends DatabaseQueryExecutor {
  checkHealth(): Promise<void>;

  close(): Promise<void>;

  transaction<TResult>(
    callback: DatabaseTransactionCallback<TResult>,
    options?: DatabaseTransactionOptions,
  ): Promise<TResult>;
}
