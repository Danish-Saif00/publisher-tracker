import {
  assertPlatformSuperAdmin,
  assertTenantCompanyRole,
  type SupabaseManagedUsersGateway,
} from '@affiliate-tracker/auth';

import { ApiHttpError } from './api.errors.js';
import {
  CustomDomainProviderError,
  type CustomDomainProvider,
} from './custom-domain-provider.js';
import type { ResolvedApiIdentity } from './identity-resolver.js';
import type { FactoryResetRepository } from './factory-reset.repository.js';
import type {
  FactoryResetReport,
  FactoryResetRepositoryContext,
  FactoryResetScope,
} from './factory-reset.types.js';

const TRACKER_CONFIRMATION = 'RESET TRACKER';
const COMPANY_CONFIRMATION = 'RESET COMPANY';

export interface FactoryResetServiceOptions {
  readonly customDomainProvider?: CustomDomainProvider;
}

export interface FactoryResetService {
  resetTracker(
    identity: ResolvedApiIdentity,
    requestId: string,
    confirmation: string,
  ): Promise<FactoryResetReport>;
  resetCompany(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    confirmation: string,
  ): Promise<FactoryResetReport>;
}

function createContext(
  identity: ResolvedApiIdentity,
  requestId: string,
  companyId?: string,
): FactoryResetRepositoryContext {
  return {
    actorUserId: identity.actor.userId,
    requestId,
    ...(companyId !== undefined ? { companyId } : {}),
  };
}

function assertConfirmation(actual: string, expected: string): void {
  if (actual !== expected) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `confirmation must exactly match "${expected}".`,
    );
  }
}

async function finishExternalCleanup(
  repository: FactoryResetRepository,
  context: FactoryResetRepositoryContext,
  scope: FactoryResetScope,
  companyId: string | null,
  customDomainProvider: CustomDomainProvider | undefined,
): Promise<Readonly<{ purged: number; pending: number }>> {
  const pendingBefore = await repository.listPendingExternalCleanup(
    context,
    scope,
    companyId,
  );

  if (customDomainProvider === undefined) {
    return Object.freeze({
      purged: 0,
      pending: pendingBefore.length,
    });
  }

  let purged = 0;

  for (const cleanup of pendingBefore) {
    const deleted = await customDomainProvider
      .delete(cleanup.resourceId)
      .then(() => true)
      .catch(
        (error: unknown) =>
          error instanceof CustomDomainProviderError && error.statusCode === 404,
      );

    if (!deleted) {
      continue;
    }

    await repository.completeExternalCleanup(
      context,
      cleanup.resetId,
      cleanup.provider,
      cleanup.resourceType,
      cleanup.resourceId,
    );
    purged += 1;
  }

  const pendingAfter = await repository.listPendingExternalCleanup(
    context,
    scope,
    companyId,
  );

  return Object.freeze({
    purged,
    pending: pendingAfter.length,
  });
}

async function finishStorageCleanup(
  repository: FactoryResetRepository,
  gateway: SupabaseManagedUsersGateway,
  context: FactoryResetRepositoryContext,
  scope: FactoryResetScope,
  companyId: string | null,
): Promise<Readonly<{ purged: number; pending: number }>> {
  const pendingBefore = await repository.listPendingStorageCleanup(
    context,
    scope,
    companyId,
  );

  let purged = 0;

  for (const cleanup of pendingBefore) {
    try {
      await gateway.purgeManagedUserStorageObject(
        cleanup.bucketId,
        cleanup.objectName,
      );
      await repository.completeStorageCleanup(
        context,
        cleanup.resetId,
        cleanup.bucketId,
        cleanup.objectName,
      );
      purged += 1;
    } catch {
      // Supabase requires object removal through the Storage API. Keep the
      // queue row when Storage is temporarily unavailable, then retry safely.
    }
  }

  const pendingAfter = await repository.listPendingStorageCleanup(
    context,
    scope,
    companyId,
  );

  return Object.freeze({
    purged,
    pending: pendingAfter.length,
  });
}

async function finishAuthCleanup(
  repository: FactoryResetRepository,
  gateway: SupabaseManagedUsersGateway,
  context: FactoryResetRepositoryContext,
  scope: FactoryResetScope,
  companyId: string | null,
): Promise<Readonly<{ purged: number; pending: number }>> {
  const pendingBefore = await repository.listPendingAuthCleanup(
    context,
    scope,
    companyId,
  );

  let purged = 0;

  for (const cleanup of pendingBefore) {
    try {
      await gateway.purgeManagedUser(cleanup.userId);
      await repository.completeAuthCleanup(
        context,
        cleanup.resetId,
        cleanup.userId,
      );
      purged += 1;
    } catch {
      // The database reset has already completed. Keep the private cleanup row
      // so a later factory-reset attempt can safely retry the Auth purge.
    }
  }

  const pendingAfter = await repository.listPendingAuthCleanup(
    context,
    scope,
    companyId,
  );

  return Object.freeze({
    purged,
    pending: pendingAfter.length,
  });
}

export function createFactoryResetService(
  repository: FactoryResetRepository,
  managedUsersGateway: SupabaseManagedUsersGateway,
  options: FactoryResetServiceOptions = {},
): FactoryResetService {
  return Object.freeze<FactoryResetService>({
    async resetTracker(identity, requestId, confirmation): Promise<FactoryResetReport> {
      assertPlatformSuperAdmin(identity.subject);
      assertConfirmation(confirmation, TRACKER_CONFIRMATION);

      const context = createContext(identity, requestId);
      const databaseResult = await repository.resetTracker(context);
      const externalCleanup = await finishExternalCleanup(
        repository,
        context,
        'tracker',
        null,
        options.customDomainProvider,
      );
      const storageCleanup = await finishStorageCleanup(
        repository,
        managedUsersGateway,
        context,
        'tracker',
        null,
      );
      const authCleanup = await finishAuthCleanup(
        repository,
        managedUsersGateway,
        context,
        'tracker',
        null,
      );

      return Object.freeze({
        ...databaseResult,
        authUsersPurged: authCleanup.purged,
        authUsersPending: authCleanup.pending,
        externalResourcesPurged: externalCleanup.purged,
        externalResourcesPending: externalCleanup.pending,
        storageObjectsPurged: storageCleanup.purged,
        storageObjectsPending: storageCleanup.pending,
        completed:
          authCleanup.pending === 0 &&
          externalCleanup.pending === 0 &&
          storageCleanup.pending === 0,
      });
    },

    async resetCompany(identity, requestId, companyId, confirmation): Promise<FactoryResetReport> {
      assertTenantCompanyRole(
        identity.subject,
        identity.companyMembership,
        companyId,
        ['company_admin'],
      );
      assertConfirmation(confirmation, COMPANY_CONFIRMATION);

      const context = createContext(identity, requestId, companyId);
      const databaseResult = await repository.resetCompany(
        context,
        companyId,
        identity.actor.userId,
      );
      const externalCleanup = await finishExternalCleanup(
        repository,
        context,
        'company',
        companyId,
        options.customDomainProvider,
      );
      const storageCleanup = await finishStorageCleanup(
        repository,
        managedUsersGateway,
        context,
        'company',
        companyId,
      );
      const authCleanup = await finishAuthCleanup(
        repository,
        managedUsersGateway,
        context,
        'company',
        companyId,
      );

      return Object.freeze({
        ...databaseResult,
        authUsersPurged: authCleanup.purged,
        authUsersPending: authCleanup.pending,
        externalResourcesPurged: externalCleanup.purged,
        externalResourcesPending: externalCleanup.pending,
        storageObjectsPurged: storageCleanup.purged,
        storageObjectsPending: storageCleanup.pending,
        completed:
          authCleanup.pending === 0 &&
          externalCleanup.pending === 0 &&
          storageCleanup.pending === 0,
      });
    },
  });
}
