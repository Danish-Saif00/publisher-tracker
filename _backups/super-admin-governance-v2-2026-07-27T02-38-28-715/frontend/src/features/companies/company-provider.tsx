import { useMutation, useQuery } from '@tanstack/react-query';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { queryClient } from '../../app/query-client';
import { useAuth } from '../auth/use-auth';
import { CompanyContext, type CompanyContextValue } from './company-context';
import {
  createCompany as createCompanyRequest,
  fetchAvailableCompanies,
} from './company-api';
import {
  clearStoredCompanyId,
  readStoredCompanyId,
  storeCompanyId,
} from './company-storage';
import type { CompanyRecord, CreateCompanyInput } from './company.types';

const COMPANIES_QUERY_KEY = ['available-companies'] as const;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Company data could not be loaded.';
}

export function CompanyProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const authStatus = auth.status;
  const identity = auth.identity;
  const session = auth.session;
  const refreshIdentity = auth.refreshIdentity;
  const [preferredCompanyId, setPreferredCompanyId] = useState<string | null>(() =>
    readStoredCompanyId(),
  );
  const canListCompanies = authStatus === 'authenticated' && session !== null;

  const companiesQuery = useQuery<readonly CompanyRecord[]>({
    queryKey: COMPANIES_QUERY_KEY,
    enabled: canListCompanies,
    queryFn: ({ signal }) => {
      if (session === null) {
        throw new Error('An authenticated session is required.');
      }

      return fetchAvailableCompanies(session.access_token, signal);
    },
  });
  const refetchCompanies = companiesQuery.refetch;
  const companies = useMemo<readonly CompanyRecord[]>(
    () => companiesQuery.data ?? [],
    [companiesQuery.data],
  );
  const activeCompany = useMemo<CompanyRecord | null>(() => {
    if (!canListCompanies || companiesQuery.isLoading || companiesQuery.isError) {
      return null;
    }

    const preferredCompany = companies.find(
      (company) =>
        company.id === preferredCompanyId && company.status === 'active',
    );

    return (
      preferredCompany ??
      companies.find((company) => company.status === 'active') ??
      null
    );
  }, [
    canListCompanies,
    companies,
    companiesQuery.isError,
    companiesQuery.isLoading,
    preferredCompanyId,
  ]);
  const activeCompanyId = activeCompany?.id ?? null;

  useEffect(() => {
    if (authStatus !== 'authenticated' || activeCompanyId === null) {
      clearStoredCompanyId();
      return;
    }

    storeCompanyId(activeCompanyId);
  }, [activeCompanyId, authStatus]);

  useEffect(() => {
    if (
      authStatus !== 'authenticated' ||
      activeCompanyId === null ||
      identity?.authorization.requestedCompanyId === activeCompanyId
    ) {
      return;
    }

    let active = true;

    void refreshIdentity(activeCompanyId).catch(() => {
      if (active) {
        setPreferredCompanyId(null);
        clearStoredCompanyId();
      }
    });

    return () => {
      active = false;
    };
  }, [activeCompanyId, authStatus, identity, refreshIdentity]);

  const createMutation = useMutation<CompanyRecord, Error, CreateCompanyInput>({
    mutationFn: async (input: CreateCompanyInput) => {
      if (session === null) {
        throw new Error('An authenticated session is required.');
      }

      return createCompanyRequest(session.access_token, input);
    },
    onSuccess: async (company) => {
      await queryClient.invalidateQueries({ queryKey: COMPANIES_QUERY_KEY });
      setPreferredCompanyId(company.id);
      storeCompanyId(company.id);
      await refreshIdentity(company.id);
      await queryClient.invalidateQueries({ queryKey: ['company-scoped'] });
    },
  });
  const mutateCompany = createMutation.mutateAsync;

  const activateCompanyContext = useCallback(
    async (companyId: string): Promise<void> => {
      if (session === null) {
        throw new Error('An authenticated session is required.');
      }

      const refreshed = await queryClient.fetchQuery({
        queryKey: COMPANIES_QUERY_KEY,
        queryFn: () => fetchAvailableCompanies(session.access_token),
      });
      const company = refreshed.find((item) => item.id === companyId);

      if (company === undefined || company.status !== 'active') {
        throw new Error('The accepted company is not available to this account.');
      }

      setPreferredCompanyId(company.id);
      storeCompanyId(company.id);
      await refreshIdentity(company.id);
      await queryClient.invalidateQueries({ queryKey: ['company-scoped'] });
    },
    [refreshIdentity, session],
  );

  const selectCompany = useCallback(
    async (companyId: string): Promise<void> => {
      const company = companies.find((item) => item.id === companyId);

      if (company === undefined) {
        throw new Error('The selected company is unavailable.');
      }

      if (company.status !== 'active') {
        throw new Error('Only an active company can be selected.');
      }

      setPreferredCompanyId(company.id);
      storeCompanyId(company.id);
      await refreshIdentity(company.id);
      await queryClient.invalidateQueries({ queryKey: ['company-scoped'] });
    },
    [companies, refreshIdentity],
  );

  const refreshCompanies = useCallback(async (): Promise<void> => {
    await refetchCompanies();
  }, [refetchCompanies]);

  const createCompany = useCallback(
    async (input: CreateCompanyInput): Promise<CompanyRecord> => mutateCompany(input),
    [mutateCompany],
  );

  const value = useMemo<CompanyContextValue>(
    () => ({
      companies,
      activeCompany,
      activeCompanyId,
      status: !canListCompanies
        ? 'idle'
        : companiesQuery.isLoading
          ? 'loading'
          : companiesQuery.isError
            ? 'error'
            : 'ready',
      error: companiesQuery.error
        ? getErrorMessage(companiesQuery.error)
        : createMutation.error
          ? getErrorMessage(createMutation.error)
          : null,
      createCompany,
      refreshCompanies,
      selectCompany,
      activateCompanyContext,
    }),
    [
      activeCompany,
      activeCompanyId,
      activateCompanyContext,
      canListCompanies,
      companies,
      companiesQuery.error,
      companiesQuery.isError,
      companiesQuery.isLoading,
      createCompany,
      createMutation.error,
      refreshCompanies,
      selectCompany,
    ],
  );

  return <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>;
}
