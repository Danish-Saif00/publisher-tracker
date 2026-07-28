import type {
  CompanyMembershipStatus,
  CompanyRole,
  PlatformRole,
} from '../auth/auth.types';
import {
  authenticatedApiRequest,
  isRecord,
  readNullableString,
  readRequiredString,
} from '../../lib/api-client';
import type {
  AuditEvent,
  CompanyInvitation,
  CompanyDirectoryUser,
  CompanyMembership,
  CursorPage,
  DirectoryFilters,
  CreateInvitationInput,
  InvitationActionInput,
  UpdateMembershipInput,
  UpdateUserStatusInput,
  UserProfile,
  UserStatus,
} from './tenant-administration.types';

type PagePayload = {
  data?: unknown;
  pagination?: unknown;
};

type DataPayload = {
  data?: unknown;
};

function readCompanyRole(value: unknown): CompanyRole {
  const role = readRequiredString(value, 'company role');

  if (!['company_admin', 'manager', 'publisher'].includes(role)) {
    throw new Error('The API returned an unsupported company role.');
  }

  return role as CompanyRole;
}

function readMembershipStatus(value: unknown): CompanyMembershipStatus {
  const status = readRequiredString(value, 'membership status');

  if (!['invited', 'active', 'suspended', 'revoked'].includes(status)) {
    throw new Error('The API returned an unsupported membership status.');
  }

  return status as CompanyMembershipStatus;
}

function readUserStatus(value: unknown): UserStatus {
  const status = readRequiredString(value, 'user status');

  if (!['active', 'suspended'].includes(status)) {
    throw new Error('The API returned an unsupported user status.');
  }

  return status as UserStatus;
}

function readPlatformRole(value: unknown): PlatformRole | null {
  if (value === null) {
    return null;
  }

  const role = readRequiredString(value, 'platform role');

  if (role !== 'platform_super_admin') {
    throw new Error('The API returned an unsupported platform role.');
  }

  return role;
}

function readMetadata(value: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) {
    throw new Error('The API returned invalid audit metadata.');
  }

  return Object.freeze({ ...value });
}

function parseDirectoryUser(value: unknown): CompanyDirectoryUser {
  if (!isRecord(value)) {
    throw new Error('The API returned an invalid company user.');
  }

  return {
    membershipId: readRequiredString(value.membershipId, 'membership id'),
    companyId: readRequiredString(value.companyId, 'company id'),
    userId: readRequiredString(value.userId, 'user id'),
    email: readNullableString(value.email, 'user email'),
    displayName: readNullableString(value.displayName, 'display name'),
    avatarPath: readNullableString(value.avatarPath, 'avatar path'),
    userStatus: readUserStatus(value.userStatus),
    role: readCompanyRole(value.role),
    membershipStatus: readMembershipStatus(value.membershipStatus),
    joinedAt: readNullableString(value.joinedAt, 'joined time'),
    membershipCreatedAt: readRequiredString(
      value.membershipCreatedAt,
      'membership created time',
    ),
    membershipUpdatedAt: readRequiredString(
      value.membershipUpdatedAt,
      'membership updated time',
    ),
    profileUpdatedAt: readRequiredString(
      value.profileUpdatedAt,
      'profile updated time',
    ),
  };
}

function parseMembership(value: unknown): CompanyMembership {
  if (!isRecord(value)) {
    throw new Error('The API returned an invalid company membership.');
  }

  return {
    id: readRequiredString(value.id, 'membership id'),
    companyId: readRequiredString(value.companyId, 'company id'),
    userId: readRequiredString(value.userId, 'user id'),
    role: readCompanyRole(value.role),
    status: readMembershipStatus(value.status),
    invitedBy: readNullableString(value.invitedBy, 'membership inviter'),
    joinedAt: readNullableString(value.joinedAt, 'membership joined time'),
    createdAt: readRequiredString(value.createdAt, 'membership created time'),
    updatedAt: readRequiredString(value.updatedAt, 'membership updated time'),
  };
}

function parseUserProfile(value: unknown): UserProfile {
  if (!isRecord(value)) {
    throw new Error('The API returned an invalid user profile.');
  }

  return {
    userId: readRequiredString(value.userId, 'user id'),
    displayName: readNullableString(value.displayName, 'display name'),
    avatarPath: readNullableString(value.avatarPath, 'avatar path'),
    platformRole: readPlatformRole(value.platformRole),
    status: readUserStatus(value.status),
    createdAt: readRequiredString(value.createdAt, 'user created time'),
    updatedAt: readRequiredString(value.updatedAt, 'user updated time'),
  };
}

function readInvitationStatus(value: unknown): CompanyInvitation['status'] {
  const status = readRequiredString(value, 'invitation status');

  if (!['pending', 'accepted', 'revoked'].includes(status)) {
    throw new Error('The API returned an unsupported invitation status.');
  }

  return status as CompanyInvitation['status'];
}

function readInvitationDeliveryStatus(
  value: unknown,
): CompanyInvitation['deliveryStatus'] {
  const status = readRequiredString(value, 'invitation delivery status');

  if (!['pending', 'sent', 'failed'].includes(status)) {
    throw new Error('The API returned an unsupported invitation delivery status.');
  }

  return status as CompanyInvitation['deliveryStatus'];
}

function readRequiredBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`The API returned an invalid ${fieldName}.`);
  }

  return value;
}

function readRequiredNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`The API returned an invalid ${fieldName}.`);
  }

  return value;
}

function parseInvitation(value: unknown): CompanyInvitation {
  if (!isRecord(value)) {
    throw new Error('The API returned an invalid company invitation.');
  }

  return {
    id: readRequiredString(value.id, 'invitation id'),
    companyId: readRequiredString(value.companyId, 'company id'),
    email: readRequiredString(value.email, 'invitation email'),
    role: readCompanyRole(value.role),
    status: readInvitationStatus(value.status),
    deliveryStatus: readInvitationDeliveryStatus(value.deliveryStatus),
    userId: readNullableString(value.userId, 'invited user id'),
    requiresPasswordSetup: readRequiredBoolean(
      value.requiresPasswordSetup,
      'password setup flag',
    ),
    invitedBy: readNullableString(value.invitedBy, 'inviter id'),
    expiresAt: readRequiredString(value.expiresAt, 'invitation expiry'),
    acceptedAt: readNullableString(value.acceptedAt, 'invitation accepted time'),
    revokedAt: readNullableString(value.revokedAt, 'invitation revoked time'),
    lastSentAt: readNullableString(value.lastSentAt, 'invitation sent time'),
    sendCount: readRequiredNumber(value.sendCount, 'invitation send count'),
    lastDeliveryErrorCode: readNullableString(
      value.lastDeliveryErrorCode,
      'invitation delivery error',
    ),
    createdAt: readRequiredString(value.createdAt, 'invitation created time'),
    updatedAt: readRequiredString(value.updatedAt, 'invitation updated time'),
  };
}

function parseAuditEvent(value: unknown): AuditEvent {
  if (!isRecord(value)) {
    throw new Error('The API returned an invalid audit event.');
  }

  return {
    id: readRequiredString(value.id, 'audit event id'),
    companyId: readNullableString(value.companyId, 'audit company id'),
    actorUserId: readNullableString(value.actorUserId, 'audit actor id'),
    requestId: readNullableString(value.requestId, 'audit request id'),
    eventName: readRequiredString(value.eventName, 'audit event name'),
    entityType: readRequiredString(value.entityType, 'audit entity type'),
    entityId: readNullableString(value.entityId, 'audit entity id'),
    metadata: readMetadata(value.metadata),
    createdAt: readRequiredString(value.createdAt, 'audit event time'),
  };
}

function readPage<TItem>(
  payload: unknown,
  parser: (value: unknown) => TItem,
): CursorPage<TItem> {
  const envelope = isRecord(payload) ? (payload as PagePayload) : {};

  if (!Array.isArray(envelope.data)) {
    throw new Error('The API returned an invalid paginated collection.');
  }

  const pagination = isRecord(envelope.pagination)
    ? envelope.pagination
    : {};
  const nextCursor = pagination.nextCursor;

  if (nextCursor !== null && typeof nextCursor !== 'string') {
    throw new Error('The API returned an invalid pagination cursor.');
  }

  return {
    items: envelope.data.map(parser),
    nextCursor,
  };
}

function readData(payload: unknown): unknown {
  const envelope = isRecord(payload) ? (payload as DataPayload) : {};
  return envelope.data;
}

function createDirectoryQuery(filters: DirectoryFilters): string {
  const parameters = new URLSearchParams({ limit: '100' });
  const search = filters.search.trim();

  if (search.length > 0) {
    parameters.set('search', search);
  }

  if (filters.role !== '') {
    parameters.set('role', filters.role);
  }

  if (filters.membershipStatus !== '') {
    parameters.set('membershipStatus', filters.membershipStatus);
  }

  if (filters.userStatus !== '') {
    parameters.set('userStatus', filters.userStatus);
  }

  return parameters.toString();
}

export async function fetchCompanyDirectory(
  accessToken: string,
  companyId: string,
  filters: DirectoryFilters,
  signal?: AbortSignal,
): Promise<CursorPage<CompanyDirectoryUser>> {
  const query = createDirectoryQuery(filters);
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/users?${query}`,
    {
      companyId,
      ...(signal !== undefined ? { signal } : {}),
    },
  );

  return readPage(payload, parseDirectoryUser);
}

export async function fetchCompanyAuditEvents(
  accessToken: string,
  companyId: string,
  signal?: AbortSignal,
): Promise<CursorPage<AuditEvent>> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/audit-events?limit=100`,
    {
      companyId,
      ...(signal !== undefined ? { signal } : {}),
    },
  );

  return readPage(payload, parseAuditEvent);
}

export async function fetchCompanyInvitations(
  accessToken: string,
  companyId: string,
  signal?: AbortSignal,
): Promise<readonly CompanyInvitation[]> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/invitations`,
    {
      companyId,
      ...(signal !== undefined ? { signal } : {}),
    },
  );
  const data = readData(payload);

  if (!isRecord(data) || !Array.isArray(data.invitations)) {
    throw new Error('The API returned an invalid invitation collection.');
  }

  return data.invitations.map(parseInvitation);
}

export async function createCompanyInvitation(
  accessToken: string,
  companyId: string,
  input: CreateInvitationInput,
): Promise<CompanyInvitation> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/invitations`,
    {
      method: 'POST',
      companyId,
      body: {
        email: input.email.trim(),
        role: input.role,
      },
    },
  );
  const data = readData(payload);

  if (!isRecord(data)) {
    throw new Error('The API returned an invalid invitation response.');
  }

  return parseInvitation(data.invitation);
}

export async function resendCompanyInvitation(
  accessToken: string,
  companyId: string,
  input: InvitationActionInput,
): Promise<CompanyInvitation> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/invitations/${input.invitationId}/resend`,
    { method: 'POST', companyId },
  );
  const data = readData(payload);

  if (!isRecord(data)) {
    throw new Error('The API returned an invalid invitation response.');
  }

  return parseInvitation(data.invitation);
}

export async function revokeCompanyInvitation(
  accessToken: string,
  companyId: string,
  input: InvitationActionInput,
): Promise<CompanyInvitation> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/invitations/${input.invitationId}/revoke`,
    { method: 'POST', companyId },
  );
  const data = readData(payload);

  if (!isRecord(data)) {
    throw new Error('The API returned an invalid invitation response.');
  }

  return parseInvitation(data.invitation);
}

export async function updateCompanyMembership(
  accessToken: string,
  companyId: string,
  input: UpdateMembershipInput,
): Promise<CompanyMembership> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${companyId}/memberships/${input.membershipId}`,
    {
      method: 'PATCH',
      companyId,
      body: {
        role: input.role,
        status: input.status,
      },
    },
  );

  return parseMembership(readData(payload));
}

export async function updatePlatformUserStatus(
  accessToken: string,
  input: UpdateUserStatusInput,
): Promise<UserProfile> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/platform/users/${input.userId}/status`,
    {
      method: 'PATCH',
      body: {
        status: input.status,
      },
    },
  );

  return parseUserProfile(readData(payload));
}
