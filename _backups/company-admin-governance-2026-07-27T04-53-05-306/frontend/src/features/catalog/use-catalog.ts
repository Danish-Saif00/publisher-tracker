import { useMutation, useQuery } from '@tanstack/react-query';

import { queryClient } from '../../app/query-client';
import { useAuth } from '../auth/use-auth';
import { useCompany } from '../companies/use-company';
import {
  createCatalogNetwork,
  createCatalogOffer,
  fetchCoreCatalog,
  updateCatalogNetwork,
  updateCatalogOffer,
  updateCatalogPublisher,
} from './catalog-api';
import type {
  CatalogNetwork,
  CatalogOffer,
  CatalogPublisher,
  CoreCatalogSnapshot,
  CreateCatalogNetworkInput,
  CreateCatalogOfferInput,
  UpdateCatalogNetworkInput,
  UpdateCatalogOfferInput,
  UpdateCatalogPublisherInput,
} from './catalog.types';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Catalog data could not be updated.';
}

export function useCatalogOperations() {
  const auth = useAuth();
  const company = useCompany();
  const accessToken = auth.session?.access_token ?? null;
  const companyId = company.activeCompanyId;
  const queryKey = ['company-scoped', companyId, 'core-catalog'] as const;
  const catalogQuery = useQuery<CoreCatalogSnapshot>({
    queryKey,
    enabled: accessToken !== null && companyId !== null,
    queryFn: ({ signal }) => {
      if (accessToken === null || companyId === null) {
        throw new Error('A selected company and authenticated session are required.');
      }

      return fetchCoreCatalog(accessToken, companyId, signal);
    },
  });

  async function invalidateCatalog(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: ['company-scoped', companyId] });
  }

  const createOfferMutation = useMutation<CatalogOffer, Error, CreateCatalogOfferInput>({
    mutationFn: (input) => {
      if (accessToken === null || companyId === null) {
        throw new Error('A selected company and authenticated session are required.');
      }

      return createCatalogOffer(accessToken, companyId, input);
    },
    onSuccess: invalidateCatalog,
  });

  const updateOfferMutation = useMutation<CatalogOffer, Error, UpdateCatalogOfferInput>({
    mutationFn: (input) => {
      if (accessToken === null || companyId === null) {
        throw new Error('A selected company and authenticated session are required.');
      }

      return updateCatalogOffer(accessToken, companyId, input);
    },
    onSuccess: invalidateCatalog,
  });

  const createNetworkMutation = useMutation<CatalogNetwork, Error, CreateCatalogNetworkInput>({
    mutationFn: (input) => {
      if (accessToken === null || companyId === null) {
        throw new Error('A selected company and authenticated session are required.');
      }

      return createCatalogNetwork(accessToken, companyId, input);
    },
    onSuccess: invalidateCatalog,
  });

  const updateNetworkMutation = useMutation<CatalogNetwork, Error, UpdateCatalogNetworkInput>({
    mutationFn: (input) => {
      if (accessToken === null || companyId === null) {
        throw new Error('A selected company and authenticated session are required.');
      }

      return updateCatalogNetwork(accessToken, companyId, input);
    },
    onSuccess: invalidateCatalog,
  });

  const updatePublisherMutation = useMutation<CatalogPublisher, Error, UpdateCatalogPublisherInput>({
    mutationFn: (input) => {
      if (accessToken === null || companyId === null) {
        throw new Error('A selected company and authenticated session are required.');
      }

      return updateCatalogPublisher(accessToken, companyId, input);
    },
    onSuccess: invalidateCatalog,
  });

  const identity = auth.identity;
  const platformAdmin = identity?.authorization.platformRole === 'platform_super_admin';
  const membership = identity?.authorization.companyMembership;
  const activeRole = membership?.status === 'active' ? membership.role : null;

  return {
    snapshot: catalogQuery.data ?? null,
    isLoading: catalogQuery.isLoading,
    isRefreshing: catalogQuery.isFetching,
    isMutating:
      createOfferMutation.isPending ||
      updateOfferMutation.isPending ||
      createNetworkMutation.isPending ||
      updateNetworkMutation.isPending ||
      updatePublisherMutation.isPending,
    error:
      catalogQuery.error instanceof Error
        ? catalogQuery.error.message
        : createOfferMutation.error
          ? errorMessage(createOfferMutation.error)
          : updateOfferMutation.error
            ? errorMessage(updateOfferMutation.error)
            : createNetworkMutation.error
              ? errorMessage(createNetworkMutation.error)
              : updateNetworkMutation.error
                ? errorMessage(updateNetworkMutation.error)
                : updatePublisherMutation.error
                  ? errorMessage(updatePublisherMutation.error)
                  : null,
    permissions: {
      canReadCatalog:
        platformAdmin || activeRole === 'company_admin' || activeRole === 'manager',
      canManageCatalog: platformAdmin || activeRole === 'company_admin',
      canManagePublishers:
        platformAdmin || activeRole === 'company_admin' || activeRole === 'manager',
    },
    refresh: async () => {
      await catalogQuery.refetch();
    },
    createOffer: createOfferMutation.mutateAsync,
    updateOffer: updateOfferMutation.mutateAsync,
    createNetwork: createNetworkMutation.mutateAsync,
    updateNetwork: updateNetworkMutation.mutateAsync,
    updatePublisher: updatePublisherMutation.mutateAsync,
  };
}
