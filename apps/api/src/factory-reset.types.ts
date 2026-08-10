export type FactoryResetScope = 'tracker' | 'company';

export interface FactoryResetRepositoryContext {
  readonly actorUserId: string;
  readonly requestId: string;
  readonly companyId?: string;
}

export interface FactoryResetDatabaseResult {
  readonly resetId: string;
  readonly scope: FactoryResetScope;
  readonly companyId: string | null;
  readonly deletedTables: number;
  readonly deletedRecords: number;
  readonly authUsersTargeted: number;
  readonly externalResourcesTargeted: number;
  readonly storageObjectsTargeted: number;
}

export interface FactoryResetAuthCleanupRecord {
  readonly resetId: string;
  readonly userId: string;
}

export interface FactoryResetExternalCleanupRecord {
  readonly resetId: string;
  readonly provider: 'render';
  readonly resourceType: 'tracking_domain';
  readonly resourceId: string;
  readonly hostname: string;
}

export interface FactoryResetStorageCleanupRecord {
  readonly resetId: string;
  readonly bucketId: string;
  readonly objectName: string;
}

export interface FactoryResetReport extends FactoryResetDatabaseResult {
  readonly authUsersPurged: number;
  readonly authUsersPending: number;
  readonly externalResourcesPurged: number;
  readonly externalResourcesPending: number;
  readonly storageObjectsPurged: number;
  readonly storageObjectsPending: number;
  readonly completed: boolean;
}
