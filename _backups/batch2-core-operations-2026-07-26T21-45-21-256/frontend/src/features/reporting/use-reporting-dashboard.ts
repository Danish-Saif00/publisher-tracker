import { useQuery } from '@tanstack/react-query';

import { useAuth } from '../auth/use-auth';
import { useCompany } from '../companies/use-company';
import {
  fetchOperationalEvents,
  fetchReportingDashboard,
} from './reporting-api';
import type {
  CompanyReportingDashboard,
  OperationalEvent,
} from './reporting.types';

export function useReportingDashboard() {
  const auth = useAuth();
  const company = useCompany();
  const accessToken = auth.session?.access_token ?? null;
  const companyId = company.activeCompanyId;

  const dashboardQuery = useQuery<CompanyReportingDashboard>({
    queryKey: ['company-scoped', companyId, 'reporting-dashboard'],
    enabled: accessToken !== null && companyId !== null,
    queryFn: ({ signal }) => {
      if (accessToken === null || companyId === null) {
        throw new Error('A selected company and authenticated session are required.');
      }

      return fetchReportingDashboard(accessToken, companyId, signal);
    },
  });

  const eventsQuery = useQuery<readonly OperationalEvent[]>({
    queryKey: ['company-scoped', companyId, 'operational-events'],
    enabled: accessToken !== null && companyId !== null,
    queryFn: ({ signal }) => {
      if (accessToken === null || companyId === null) {
        throw new Error('A selected company and authenticated session are required.');
      }

      return fetchOperationalEvents(accessToken, companyId, signal);
    },
  });

  return {
    dashboard: dashboardQuery.data ?? null,
    events: eventsQuery.data ?? [],
    error:
      dashboardQuery.error instanceof Error
        ? dashboardQuery.error.message
        : eventsQuery.error instanceof Error
          ? eventsQuery.error.message
          : null,
    isLoading: dashboardQuery.isLoading || eventsQuery.isLoading,
    refresh: async () => {
      await Promise.all([dashboardQuery.refetch(), eventsQuery.refetch()]);
    },
  };
}
