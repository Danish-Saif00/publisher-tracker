import type {
  DatabaseExecutionContext,
  DatabaseRuntime,
} from '@affiliate-tracker/database';

import type {
  FactoryResetAuthCleanupRecord,
  FactoryResetDatabaseResult,
  FactoryResetExternalCleanupRecord,
  FactoryResetStorageCleanupRecord,
  FactoryResetRepositoryContext,
  FactoryResetScope,
} from './factory-reset.types.js';

type FactoryResetRow = Readonly<{
  reset_id: string;
  scope: string;
  company_id: string | null;
  deleted_tables: number | string;
  deleted_records: number | string;
  auth_users_targeted: number | string;
  external_resources_targeted: number | string;
  storage_objects_targeted: number | string;
}> &
  Record<string, unknown>;

type AuthCleanupRow = Readonly<{
  reset_id: string;
  user_id: string;
}> &
  Record<string, unknown>;

type ExternalCleanupRow = Readonly<{
  reset_id: string;
  provider: string;
  resource_type: string;
  resource_id: string;
  hostname: string;
}> &
  Record<string, unknown>;

type StorageCleanupRow = Readonly<{
  reset_id: string;
  bucket_id: string;
  object_name: string;
}> &
  Record<string, unknown>;

export interface FactoryResetRepository {
  resetTracker(context: FactoryResetRepositoryContext): Promise<FactoryResetDatabaseResult>;
  resetCompany(
    context: FactoryResetRepositoryContext,
    companyId: string,
    preservedAdminUserId: string,
  ): Promise<FactoryResetDatabaseResult>;
  listPendingAuthCleanup(
    context: FactoryResetRepositoryContext,
    scope: FactoryResetScope,
    companyId: string | null,
  ): Promise<readonly FactoryResetAuthCleanupRecord[]>;
  completeAuthCleanup(
    context: FactoryResetRepositoryContext,
    resetId: string,
    userId: string,
  ): Promise<void>;
  listPendingExternalCleanup(
    context: FactoryResetRepositoryContext,
    scope: FactoryResetScope,
    companyId: string | null,
  ): Promise<readonly FactoryResetExternalCleanupRecord[]>;
  completeExternalCleanup(
    context: FactoryResetRepositoryContext,
    resetId: string,
    provider: 'render',
    resourceType: 'tracking_domain',
    resourceId: string,
  ): Promise<void>;
  listPendingStorageCleanup(
    context: FactoryResetRepositoryContext,
    scope: FactoryResetScope,
    companyId: string | null,
  ): Promise<readonly FactoryResetStorageCleanupRecord[]>;
  completeStorageCleanup(
    context: FactoryResetRepositoryContext,
    resetId: string,
    bucketId: string,
    objectName: string,
  ): Promise<void>;
}

function createDatabaseSessionContext(
  context: FactoryResetRepositoryContext,
): DatabaseExecutionContext {
  return {
    actorUserId: context.actorUserId,
    requestId: context.requestId,
    ...(context.companyId !== undefined ? { companyId: context.companyId } : {}),
  };
}

function readNonNegativeInteger(value: number | string, fieldName: string): number {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`The database returned an invalid ${fieldName}.`);
  }

  return parsed;
}

function parseScope(value: string): FactoryResetScope {
  if (value === 'tracker' || value === 'company') {
    return value;
  }

  throw new Error('The database returned an invalid factory-reset scope.');
}

function mapResetRow(row: FactoryResetRow): FactoryResetDatabaseResult {
  return Object.freeze({
    resetId: row.reset_id,
    scope: parseScope(row.scope),
    companyId: row.company_id,
    deletedTables: readNonNegativeInteger(row.deleted_tables, 'deleted table count'),
    deletedRecords: readNonNegativeInteger(row.deleted_records, 'deleted record count'),
    authUsersTargeted: readNonNegativeInteger(row.auth_users_targeted, 'auth-user target count'),
    externalResourcesTargeted: readNonNegativeInteger(
      row.external_resources_targeted,
      'external-resource target count',
    ),
    storageObjectsTargeted: readNonNegativeInteger(
      row.storage_objects_targeted,
      'storage-object target count',
    ),
  });
}

function mapExternalCleanupRow(row: ExternalCleanupRow): FactoryResetExternalCleanupRecord {
  if (row.provider !== 'render' || row.resource_type !== 'tracking_domain') {
    throw new Error('The database returned an unsupported factory-reset external resource.');
  }

  return Object.freeze({
    resetId: row.reset_id,
    provider: row.provider,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    hostname: row.hostname,
  });
}

export function createFactoryResetRepository(database: DatabaseRuntime): FactoryResetRepository {
  return Object.freeze<FactoryResetRepository>({
    async resetTracker(context): Promise<FactoryResetDatabaseResult> {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<FactoryResetRow>({
            name: 'factory-reset-tracker',
            text: `
              select
                reset_id,
                scope,
                company_id,
                deleted_tables,
                deleted_records,
                auth_users_targeted,
                external_resources_targeted,
                storage_objects_targeted
              from private.factory_reset_tracker()
            `,
          });

          const row = result.rows[0];

          if (row === undefined) {
            throw new Error('The tracker factory reset did not return a result.');
          }

          return mapResetRow(row);
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async resetCompany(context, companyId, preservedAdminUserId): Promise<FactoryResetDatabaseResult> {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<FactoryResetRow>({
            name: 'factory-reset-company',
            text: `
              select
                reset_id,
                scope,
                company_id,
                deleted_tables,
                deleted_records,
                auth_users_targeted,
                external_resources_targeted,
                storage_objects_targeted
              from private.factory_reset_company(
                $1::uuid,
                $2::uuid
              )
            `,
            values: [companyId, preservedAdminUserId],
          });

          const row = result.rows[0];

          if (row === undefined) {
            throw new Error('The company factory reset did not return a result.');
          }

          return mapResetRow(row);
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async listPendingAuthCleanup(context, scope, companyId): Promise<readonly FactoryResetAuthCleanupRecord[]> {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<AuthCleanupRow>({
            name: 'factory-reset-list-pending-auth-cleanup',
            text: `
              select
                reset_id,
                user_id
              from private.list_factory_reset_auth_cleanup(
                $1::text,
                $2::uuid
              )
            `,
            values: [scope, companyId],
          });

          return Object.freeze(
            result.rows.map((row) =>
              Object.freeze({
                resetId: row.reset_id,
                userId: row.user_id,
              }),
            ),
          );
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async completeAuthCleanup(context, resetId, userId): Promise<void> {
      await database.transaction(
        async (transaction) => {
          await transaction.query({
            name: 'factory-reset-complete-auth-cleanup',
            text: `
              select private.complete_factory_reset_auth_cleanup(
                $1::uuid,
                $2::uuid
              )
            `,
            values: [resetId, userId],
          });
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async listPendingExternalCleanup(
      context,
      scope,
      companyId,
    ): Promise<readonly FactoryResetExternalCleanupRecord[]> {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<ExternalCleanupRow>({
            name: 'factory-reset-list-pending-external-cleanup',
            text: `
              select
                reset_id,
                provider,
                resource_type,
                resource_id,
                hostname
              from private.list_factory_reset_external_cleanup(
                $1::text,
                $2::uuid
              )
            `,
            values: [scope, companyId],
          });

          return Object.freeze(result.rows.map(mapExternalCleanupRow));
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async completeExternalCleanup(
      context,
      resetId,
      provider,
      resourceType,
      resourceId,
    ): Promise<void> {
      await database.transaction(
        async (transaction) => {
          await transaction.query({
            name: 'factory-reset-complete-external-cleanup',
            text: `
              select private.complete_factory_reset_external_cleanup(
                $1::uuid,
                $2::text,
                $3::text,
                $4::text
              )
            `,
            values: [resetId, provider, resourceType, resourceId],
          });
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async listPendingStorageCleanup(
      context,
      scope,
      companyId,
    ): Promise<readonly FactoryResetStorageCleanupRecord[]> {
      return database.transaction(
        async (transaction) => {
          const result = await transaction.query<StorageCleanupRow>({
            name: 'factory-reset-list-pending-storage-cleanup',
            text: `
              select
                reset_id,
                bucket_id,
                object_name
              from private.list_factory_reset_storage_cleanup(
                $1::text,
                $2::uuid
              )
            `,
            values: [scope, companyId],
          });

          return Object.freeze(
            result.rows.map((row) =>
              Object.freeze({
                resetId: row.reset_id,
                bucketId: row.bucket_id,
                objectName: row.object_name,
              }),
            ),
          );
        },
        {
          readOnly: true,
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },

    async completeStorageCleanup(
      context,
      resetId,
      bucketId,
      objectName,
    ): Promise<void> {
      await database.transaction(
        async (transaction) => {
          await transaction.query({
            name: 'factory-reset-complete-storage-cleanup',
            text: `
              select private.complete_factory_reset_storage_cleanup(
                $1::uuid,
                $2::text,
                $3::text
              )
            `,
            values: [resetId, bucketId, objectName],
          });
        },
        {
          sessionContext: createDatabaseSessionContext(context),
        },
      );
    },
  });
}
