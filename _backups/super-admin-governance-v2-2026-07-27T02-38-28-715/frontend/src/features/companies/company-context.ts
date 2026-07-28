import { createContext } from 'react';

import type {
  CompanyLoadStatus,
  CompanyRecord,
  CreateCompanyInput,
} from './company.types';

export type CompanyContextValue = {
  companies: readonly CompanyRecord[];
  activeCompany: CompanyRecord | null;
  activeCompanyId: string | null;
  status: CompanyLoadStatus;
  error: string | null;
  createCompany(input: CreateCompanyInput): Promise<CompanyRecord>;
  refreshCompanies(): Promise<void>;
  selectCompany(companyId: string): Promise<void>;
  activateCompanyContext(companyId: string): Promise<void>;
};

export const CompanyContext = createContext<CompanyContextValue | null>(null);
