import {
  authenticatedApiRequest,
  isRecord,
  readNullableString,
  readRequiredString,
} from '../../lib/api-client';
import type {
  CompanyRecord,
  CompanyStatus,
  CreateCompanyInput,
} from './company.types';

type CompaniesPayload = {
  data?: unknown;
};

function readCompanyStatus(value: unknown): CompanyStatus {
  const status = readRequiredString(value, 'company status');

  if (!['active', 'suspended', 'archived'].includes(status)) {
    throw new Error('The API returned an unsupported company status.');
  }

  return status as CompanyStatus;
}

export function parseCompanyRecord(value: unknown): CompanyRecord {
  if (!isRecord(value)) {
    throw new Error('The API returned an invalid company record.');
  }

  return {
    id: readRequiredString(value.id, 'company id'),
    slug: readRequiredString(value.slug, 'company slug'),
    name: readRequiredString(value.name, 'company name'),
    status: readCompanyStatus(value.status),
    timezone: readRequiredString(value.timezone, 'company timezone'),
    createdBy: readNullableString(value.createdBy, 'company creator'),
    createdAt: readRequiredString(value.createdAt, 'company created time'),
    updatedAt: readRequiredString(value.updatedAt, 'company updated time'),
  };
}

function readData(payload: unknown): unknown {
  const envelope = isRecord(payload) ? (payload as CompaniesPayload) : {};
  return envelope.data;
}

export async function fetchAvailableCompanies(
  accessToken: string,
  signal?: AbortSignal,
): Promise<readonly CompanyRecord[]> {
  const payload = await authenticatedApiRequest(accessToken, '/me/companies', {
    ...(signal !== undefined ? { signal } : {}),
  });
  const data = readData(payload);

  if (!Array.isArray(data)) {
    throw new Error('The API returned an invalid company collection.');
  }

  return data.map(parseCompanyRecord);
}

export async function createCompany(
  accessToken: string,
  input: CreateCompanyInput,
): Promise<CompanyRecord> {
  const payload = await authenticatedApiRequest(accessToken, '/platform/companies', {
    method: 'POST',
    body: {
      slug: input.slug.trim(),
      name: input.name.trim(),
      ...(input.timezone !== undefined && input.timezone.trim().length > 0
        ? { timezone: input.timezone.trim() }
        : {}),
    },
  });

  return parseCompanyRecord(readData(payload));
}
