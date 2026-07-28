import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

import { queryClient } from '../../app/query-client';
import { useAuth } from '../auth/use-auth';
import { useCompany } from '../companies/use-company';
import {
  createCompanyInvitation,
  fetchCompanyAuditEvents,
  fetchCompanyDirectory,
  fetchCompanyInvitations,
  resendCompanyInvitation,
  revokeCompanyInvitation,
  updateCompanyMembership,
  updatePlatformUserStatus,
} from './tenant-administration-api';
import type {
  AuditEvent,
  CompanyDirectoryUser,
  CompanyInvitation,
  CompanyMembership,
  CreateInvitationInput,
  CursorPage,
  DirectoryFilters,
  InvitationActionInput,
  UpdateMembershipInput,
  UpdateUserStatusInput,
  UserProfile,
} from './tenant-administration.types';

const TENANT_QUERY_PREFIX = ['company-scoped', 'tenant-administration'] as const;
const EMPTY_DIRECTORY: CursorPage<CompanyDirectoryUser> = Object.freeze({
  items: Object.freeze([]),
  nextCursor: null,
});
const EMPTY_AUDIT: CursorPage<AuditEvent> = Object.freeze({
  items: Object.freeze([]),
  nextCursor: null,
});
const EMPTY_INVITATIONS: readonly CompanyInvitation[] = Object.freeze([]);

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Tenant administration data could not be loaded.';
}

export function useTenantAdministration(filters: DirectoryFilters) {
  const auth = useAuth();
  const company = useCompany();
  const session = auth.session;
  const companyId = company.activeCompanyId;
  const enabled = session !== null && companyId !== null;

  const directoryQuery = useQuery({
    queryKey: [...TENANT_QUERY_PREFIX, 'directory', companyId, filters],
    enabled,
    queryFn: ({ signal }) => {
      if (session === null || companyId === null) {
        throw new Error('An active authenticated company context is required.');
      }

      return fetchCompanyDirectory(
        session.access_token,
        companyId,
        filters,
        signal,
      );
    },
  });
  const refetchDirectory = directoryQuery.refetch;

  const auditQuery = useQuery({
    queryKey: [...TENANT_QUERY_PREFIX, 'audit', companyId],
    enabled,
    queryFn: ({ signal }) => {
      if (session === null || companyId === null) {
        throw new Error('An active authenticated company context is required.');
      }

      return fetchCompanyAuditEvents(session.access_token, companyId, signal);
    },
  });
  const refetchAudit = auditQuery.refetch;

  const invitationsQuery = useQuery({
    queryKey: [...TENANT_QUERY_PREFIX, 'invitations', companyId],
    enabled,
    queryFn: ({ signal }) => {
      if (session === null || companyId === null) {
        throw new Error('An active authenticated company context is required.');
      }

      return fetchCompanyInvitations(session.access_token, companyId, signal);
    },
  });
  const refetchInvitations = invitationsQuery.refetch;

  const invalidateTenantData = useCallback(async (): Promise<void> => {
    await queryClient.invalidateQueries({
      queryKey: TENANT_QUERY_PREFIX,
    });
    await queryClient.invalidateQueries({
      queryKey: ['company-scoped', 'reporting'],
    });
  }, []);

  const invitationMutation = useMutation<
    CompanyInvitation,
    Error,
    CreateInvitationInput
  >({
    mutationFn: async (input) => {
      if (session === null || companyId === null) {
        throw new Error('An active authenticated company context is required.');
      }

      return createCompanyInvitation(session.access_token, companyId, input);
    },
    onSettled: invalidateTenantData,
  });

  const resendMutation = useMutation<
    CompanyInvitation,
    Error,
    InvitationActionInput
  >({
    mutationFn: async (input) => {
      if (session === null || companyId === null) {
        throw new Error('An active authenticated company context is required.');
      }

      return resendCompanyInvitation(session.access_token, companyId, input);
    },
    onSettled: invalidateTenantData,
  });

  const revokeMutation = useMutation<
    CompanyInvitation,
    Error,
    InvitationActionInput
  >({
    mutationFn: async (input) => {
      if (session === null || companyId === null) {
        throw new Error('An active authenticated company context is required.');
      }

      return revokeCompanyInvitation(session.access_token, companyId, input);
    },
    onSettled: invalidateTenantData,
  });

  const membershipMutation = useMutation<
    CompanyMembership,
    Error,
    UpdateMembershipInput
  >({
    mutationFn: async (input) => {
      if (session === null || companyId === null) {
        throw new Error('An active authenticated company context is required.');
      }

      return updateCompanyMembership(session.access_token, companyId, input);
    },
    onSettled: invalidateTenantData,
  });

  const userStatusMutation = useMutation<
    UserProfile,
    Error,
    UpdateUserStatusInput
  >({
    mutationFn: async (input) => {
      if (session === null) {
        throw new Error('An authenticated session is required.');
      }

      return updatePlatformUserStatus(session.access_token, input);
    },
    onSettled: invalidateTenantData,
  });

  const refresh = useCallback(async (): Promise<void> => {
    await Promise.all([
      refetchDirectory(),
      refetchAudit(),
      refetchInvitations(),
    ]);
  }, [refetchAudit, refetchDirectory, refetchInvitations]);

  const firstError =
    directoryQuery.error ??
    auditQuery.error ??
    invitationsQuery.error ??
    invitationMutation.error ??
    resendMutation.error ??
    revokeMutation.error ??
    membershipMutation.error ??
    userStatusMutation.error;

  return {
    companyId,
    directory: directoryQuery.data ?? EMPTY_DIRECTORY,
    invitations: invitationsQuery.data ?? EMPTY_INVITATIONS,
    audit: auditQuery.data ?? EMPTY_AUDIT,
    status: !enabled
      ? 'idle'
      : directoryQuery.isLoading ||
          auditQuery.isLoading ||
          invitationsQuery.isLoading
        ? 'loading'
        : directoryQuery.isError ||
            auditQuery.isError ||
            invitationsQuery.isError
          ? 'error'
          : 'ready',
    error: firstError === null ? null : getErrorMessage(firstError),
    isMutating:
      invitationMutation.isPending ||
      resendMutation.isPending ||
      revokeMutation.isPending ||
      membershipMutation.isPending ||
      userStatusMutation.isPending,
    createInvitation: invitationMutation.mutateAsync,
    resendInvitation: resendMutation.mutateAsync,
    revokeInvitation: revokeMutation.mutateAsync,
    updateMembership: membershipMutation.mutateAsync,
    updateUserStatus: userStatusMutation.mutateAsync,
    refresh,
  } as const;
}
