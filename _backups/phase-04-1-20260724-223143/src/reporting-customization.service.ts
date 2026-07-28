import { assertCompanyRole, isPlatformSuperAdmin } from '@affiliate-tracker/auth';

import { ApiHttpError } from './api.errors.js';
import type { CredentialCipher } from './credential-cipher.js';
import type { ResolvedApiIdentity } from './identity-resolver.js';
import type { CompanyMailTransport } from './company-mail.transport.js';
import type { CompanyOperationsRepository } from './reporting-customization.repository.js';
import type {
  CompanyCustomizationRecord,
  EncryptedCredential,
  CompanyOperationsRepositoryContext,
  CompanyReportingDashboard,
  CompanySmtpConfigurationRecord,
  CompanySmtpSecretRecord,
  CompanySmtpWriteInput,
  ListCompanyReportingInput,
  ListOperationalEventsInput,
  OperationalEventRecord,
  ReportingScope,
  TestCompanySmtpInput,
  CompanySmtpTestResult,
  UpdateCompanyCustomizationInput,
  UpdateCompanySmtpConfigurationInput,
} from './reporting-customization.types.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const HEX_COLOR_PATTERN = /^#[A-Fa-f0-9]{6}$/u;
const HOST_PATTERN = /^[^\s/\\]+$/u;
const MAX_REPORTING_RANGE_MS = 366 * 24 * 60 * 60 * 1000;
const DEFAULT_REPORTING_RANGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_OPERATIONAL_EVENT_LIMIT = 200;

export interface CompanyOperationsService {
  getReportingDashboard(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    input: ListCompanyReportingInput,
  ): Promise<CompanyReportingDashboard>;

  listOperationalEvents(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    input: ListOperationalEventsInput,
  ): Promise<readonly OperationalEventRecord[]>;

  getCustomization(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
  ): Promise<CompanyCustomizationRecord | null>;

  updateCustomization(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    input: UpdateCompanyCustomizationInput,
  ): Promise<CompanyCustomizationRecord>;

  getSmtpConfiguration(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
  ): Promise<CompanySmtpConfigurationRecord | null>;

  updateSmtpConfiguration(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    input: UpdateCompanySmtpConfigurationInput,
  ): Promise<CompanySmtpConfigurationRecord>;

  testSmtpConfiguration(
    identity: ResolvedApiIdentity,
    requestId: string,
    companyId: string,
    input: TestCompanySmtpInput,
  ): Promise<CompanySmtpTestResult>;
}

function normalizeUuid(value: string, fieldName: string): string {
  const normalizedValue = value.trim();

  if (!UUID_PATTERN.test(normalizedValue)) {
    throw new ApiHttpError('INVALID_PATH_PARAMETER', 400, `${fieldName} must be a valid UUID.`);
  }

  return normalizedValue;
}

function normalizeRequestId(value: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length === 0 || normalizedValue.length > 255) {
    throw new Error('API request ID is invalid.');
  }

  return normalizedValue;
}

function createRepositoryContext(
  identity: ResolvedApiIdentity,
  requestId: string,
  companyId: string,
): CompanyOperationsRepositoryContext {
  return {
    actorUserId: identity.actor.userId,
    requestId: normalizeRequestId(requestId),
    companyId,
  };
}

function assertReportingAccess(identity: ResolvedApiIdentity, companyId: string): void {
  assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
    'company_admin',
    'manager',
    'publisher',
  ]);
}

function assertOperationsAccess(identity: ResolvedApiIdentity, companyId: string): void {
  assertCompanyRole(identity.subject, identity.companyMembership, companyId, [
    'company_admin',
    'manager',
  ]);
}

function assertCustomizationReadAccess(identity: ResolvedApiIdentity, companyId: string): void {
  assertReportingAccess(identity, companyId);
}

function assertConfigurationWriteAccess(identity: ResolvedApiIdentity, companyId: string): void {
  assertCompanyRole(identity.subject, identity.companyMembership, companyId, ['company_admin']);
}

function normalizeDate(value: string | undefined, fallback: Date, fieldName: string): string {
  if (value === undefined) {
    return fallback.toISOString();
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new ApiHttpError(
      'INVALID_QUERY_PARAMETER',
      400,
      `${fieldName} must be a valid ISO date-time.`,
    );
  }

  return date.toISOString();
}

function normalizeReportingInput(
  input: ListCompanyReportingInput,
): Required<Pick<ListCompanyReportingInput, 'from' | 'to'>> &
  Omit<ListCompanyReportingInput, 'from' | 'to'> {
  const now = new Date();
  const to = normalizeDate(input.to, now, 'to');
  const from = normalizeDate(
    input.from,
    new Date(new Date(to).getTime() - DEFAULT_REPORTING_RANGE_MS),
    'from',
  );
  const fromTime = new Date(from).getTime();
  const toTime = new Date(to).getTime();

  if (fromTime >= toTime) {
    throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, 'from must be earlier than to.');
  }

  if (toTime - fromTime > MAX_REPORTING_RANGE_MS) {
    throw new ApiHttpError(
      'INVALID_QUERY_PARAMETER',
      400,
      'The reporting range cannot exceed 366 days.',
    );
  }

  return Object.freeze({
    from,
    to,
    ...(input.offerId !== undefined
      ? {
          offerId: normalizeUuid(input.offerId, 'offerId'),
        }
      : {}),
    ...(input.networkAccountId !== undefined
      ? {
          networkAccountId: normalizeUuid(input.networkAccountId, 'networkAccountId'),
        }
      : {}),
    ...(input.ownerMembershipId !== undefined
      ? {
          ownerMembershipId: normalizeUuid(input.ownerMembershipId, 'ownerMembershipId'),
        }
      : {}),
  });
}

function createReportingScope(identity: ResolvedApiIdentity): ReportingScope {
  if (isPlatformSuperAdmin(identity.subject)) {
    return Object.freeze({});
  }

  return identity.companyMembership?.role === 'publisher'
    ? Object.freeze({
        ownerUserId: identity.actor.userId,
      })
    : Object.freeze({});
}

function normalizeOptionalText(
  value: string | null | undefined,
  minimumLength: number,
  maximumLength: number,
  fieldName: string,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalizedValue = value.trim().replace(/\s+/gu, ' ');

  if (normalizedValue.length < minimumLength || normalizedValue.length > maximumLength) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `${fieldName} must contain ${String(minimumLength)} to ${String(maximumLength)} characters or be null.`,
    );
  }

  return normalizedValue;
}

function normalizeOptionalUrl(value: string | null | undefined, fieldName: string): string | null {
  const normalizedValue = normalizeOptionalText(value, 8, 2048, fieldName);

  if (normalizedValue === null) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(normalizedValue);
  } catch {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `${fieldName} must be a valid HTTP or HTTPS URL.`,
    );
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${fieldName} must use HTTP or HTTPS.`);
  }

  return url.toString();
}

function normalizeOptionalEmail(
  value: string | null | undefined,
  fieldName: string,
): string | null {
  const normalizedValue = normalizeOptionalText(value, 3, 320, fieldName);

  if (normalizedValue !== null && !EMAIL_PATTERN.test(normalizedValue)) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `${fieldName} must be a valid email address.`,
    );
  }

  return normalizedValue?.toLowerCase() ?? null;
}

function normalizeRequiredEmail(value: string, fieldName: string): string {
  const normalizedValue = normalizeOptionalEmail(value, fieldName);

  if (normalizedValue === null) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${fieldName} is required.`);
  }

  return normalizedValue;
}

function normalizeOptionalColor(
  value: string | null | undefined,
  fieldName: string,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  const normalizedValue = value.trim().toUpperCase();

  if (!HEX_COLOR_PATTERN.test(normalizedValue)) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `${fieldName} must be a six-digit hexadecimal color such as #1A2B3C.`,
    );
  }

  return normalizedValue;
}

function normalizeHost(value: string): string {
  const normalizedValue = value.trim().toLowerCase();

  if (
    normalizedValue.length < 1 ||
    normalizedValue.length > 253 ||
    !HOST_PATTERN.test(normalizedValue)
  ) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'host must be a valid SMTP hostname or IP address.',
    );
  }

  return normalizedValue;
}

function normalizePort(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      'port must be a whole number between 1 and 65535.',
    );
  }

  return value;
}

function normalizeRequiredText(
  value: string,
  minimumLength: number,
  maximumLength: number,
  fieldName: string,
): string {
  const normalizedValue = normalizeOptionalText(value, minimumLength, maximumLength, fieldName);

  if (normalizedValue === null) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${fieldName} is required.`);
  }

  return normalizedValue;
}

function normalizeOperationalEventsInput(
  input: ListOperationalEventsInput,
): Required<Pick<ListOperationalEventsInput, 'limit'>> & Omit<ListOperationalEventsInput, 'limit'> {
  const limit = input.limit ?? 100;

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_OPERATIONAL_EVENT_LIMIT) {
    throw new ApiHttpError(
      'INVALID_QUERY_PARAMETER',
      400,
      `limit must be a whole number between 1 and ${String(MAX_OPERATIONAL_EVENT_LIMIT)}.`,
    );
  }

  return Object.freeze({
    limit,
    ...(input.eventName !== undefined
      ? {
          eventName: normalizeRequiredText(input.eventName, 1, 160, 'eventName'),
        }
      : {}),
    ...(input.entityType !== undefined
      ? {
          entityType: normalizeRequiredText(input.entityType, 1, 120, 'entityType'),
        }
      : {}),
    ...(input.from !== undefined
      ? {
          from: normalizeDate(input.from, new Date(), 'from'),
        }
      : {}),
    ...(input.to !== undefined
      ? {
          to: normalizeDate(input.to, new Date(), 'to'),
        }
      : {}),
  });
}

function toPublicSmtpConfiguration(
  record: CompanySmtpSecretRecord,
): CompanySmtpConfigurationRecord {
  return Object.freeze({
    id: record.id,
    companyId: record.companyId,
    host: record.host,
    port: record.port,
    secureMode: record.secureMode,
    username: record.username,
    senderEmail: record.senderEmail,
    senderName: record.senderName,
    replyToEmail: record.replyToEmail,
    status: record.status,
    hasPassword: record.hasPassword,
    passwordUpdatedAt: record.passwordUpdatedAt,
    lastTestedAt: record.lastTestedAt,
    lastTestStatus: record.lastTestStatus,
    createdBy: record.createdBy,
    updatedBy: record.updatedBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

async function assertActiveCompany(
  repository: CompanyOperationsRepository,
  context: CompanyOperationsRepositoryContext,
  companyId: string,
): Promise<void> {
  const company = await repository.getCompany(context, companyId);

  if (company?.status !== 'active') {
    throw new ApiHttpError(
      'COMPANY_OPERATIONS_COMPANY_INACTIVE',
      409,
      'The company must be active.',
    );
  }
}

function createSmtpWriteInput(
  input: UpdateCompanySmtpConfigurationInput,
  current: CompanySmtpSecretRecord | undefined,
  cipher: CredentialCipher,
): CompanySmtpWriteInput {
  const password =
    input.password === undefined
      ? undefined
      : normalizeRequiredText(input.password, 1, 4096, 'password');

  if (current === undefined && password === undefined) {
    throw new ApiHttpError(
      'SMTP_PASSWORD_REQUIRED',
      400,
      'password is required when creating an SMTP configuration.',
    );
  }

  let encrypted: EncryptedCredential;
  let passwordUpdatedAt: string;

  if (password === undefined) {
    if (current === undefined) {
      throw new ApiHttpError(
        'SMTP_PASSWORD_REQUIRED',
        400,
        'password is required when creating an SMTP configuration.',
      );
    }

    encrypted = {
      ciphertext: current.encryptedPassword,
      iv: current.passwordIv,
      authTag: current.passwordAuthTag,
    };
    passwordUpdatedAt = current.passwordUpdatedAt;
  } else {
    encrypted = cipher.encrypt(password);
    passwordUpdatedAt = new Date().toISOString();
  }

  return Object.freeze({
    host: normalizeHost(input.host),
    port: normalizePort(input.port),
    secureMode: input.secureMode,
    username: normalizeRequiredText(input.username, 1, 320, 'username'),
    encryptedPassword: encrypted.ciphertext,
    passwordIv: encrypted.iv,
    passwordAuthTag: encrypted.authTag,
    senderEmail: normalizeRequiredEmail(input.senderEmail, 'senderEmail'),
    senderName: normalizeRequiredText(input.senderName, 1, 160, 'senderName'),
    replyToEmail: normalizeOptionalEmail(input.replyToEmail, 'replyToEmail'),
    status: input.status ?? 'active',
    passwordUpdatedAt,
  });
}

function normalizeMailFailure(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    const normalizedCode = error.code
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/gu, '_')
      .slice(0, 120);

    return normalizedCode.length > 0 ? normalizedCode : 'SMTP_TEST_FAILED';
  }

  return 'SMTP_TEST_FAILED';
}

export function createCompanyOperationsService(
  repository: CompanyOperationsRepository,
  credentialCipher: CredentialCipher,
  mailTransport: CompanyMailTransport,
): CompanyOperationsService {
  return Object.freeze<CompanyOperationsService>({
    async getReportingDashboard(identity, requestId, companyIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'companyId');

      assertReportingAccess(identity, companyId);

      const context = createRepositoryContext(identity, requestId, companyId);

      await assertActiveCompany(repository, context, companyId);

      return repository.getReportingDashboard(
        context,
        companyId,
        normalizeReportingInput(input),
        createReportingScope(identity),
      );
    },

    async listOperationalEvents(identity, requestId, companyIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'companyId');

      assertOperationsAccess(identity, companyId);

      const context = createRepositoryContext(identity, requestId, companyId);

      await assertActiveCompany(repository, context, companyId);

      return repository.listOperationalEvents(
        context,
        companyId,
        normalizeOperationalEventsInput(input),
      );
    },

    async getCustomization(identity, requestId, companyIdValue) {
      const companyId = normalizeUuid(companyIdValue, 'companyId');

      assertCustomizationReadAccess(identity, companyId);

      const context = createRepositoryContext(identity, requestId, companyId);

      await assertActiveCompany(repository, context, companyId);

      return (await repository.getCustomization(context, companyId)) ?? null;
    },

    async updateCustomization(identity, requestId, companyIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'companyId');

      assertConfigurationWriteAccess(identity, companyId);

      const context = createRepositoryContext(identity, requestId, companyId);

      await assertActiveCompany(repository, context, companyId);

      const current = await repository.getCustomization(context, companyId);

      return repository.upsertCustomization(context, companyId, {
        brandName:
          input.brandName === undefined
            ? (current?.brandName ?? null)
            : normalizeOptionalText(input.brandName, 2, 160, 'brandName'),
        logoUrl:
          input.logoUrl === undefined
            ? (current?.logoUrl ?? null)
            : normalizeOptionalUrl(input.logoUrl, 'logoUrl'),
        primaryColor:
          input.primaryColor === undefined
            ? (current?.primaryColor ?? null)
            : normalizeOptionalColor(input.primaryColor, 'primaryColor'),
        secondaryColor:
          input.secondaryColor === undefined
            ? (current?.secondaryColor ?? null)
            : normalizeOptionalColor(input.secondaryColor, 'secondaryColor'),
        supportEmail:
          input.supportEmail === undefined
            ? (current?.supportEmail ?? null)
            : normalizeOptionalEmail(input.supportEmail, 'supportEmail'),
      });
    },

    async getSmtpConfiguration(identity, requestId, companyIdValue) {
      const companyId = normalizeUuid(companyIdValue, 'companyId');

      assertConfigurationWriteAccess(identity, companyId);

      const context = createRepositoryContext(identity, requestId, companyId);

      await assertActiveCompany(repository, context, companyId);

      const configuration = await repository.getSmtpConfiguration(context, companyId);

      return configuration === undefined ? null : toPublicSmtpConfiguration(configuration);
    },

    async updateSmtpConfiguration(identity, requestId, companyIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'companyId');

      assertConfigurationWriteAccess(identity, companyId);

      const context = createRepositoryContext(identity, requestId, companyId);

      await assertActiveCompany(repository, context, companyId);

      const current = await repository.getSmtpConfiguration(context, companyId);
      const configuration = await repository.upsertSmtpConfiguration(
        context,
        companyId,
        createSmtpWriteInput(input, current, credentialCipher),
      );

      return toPublicSmtpConfiguration(configuration);
    },

    async testSmtpConfiguration(identity, requestId, companyIdValue, input) {
      const companyId = normalizeUuid(companyIdValue, 'companyId');

      assertConfigurationWriteAccess(identity, companyId);

      const context = createRepositoryContext(identity, requestId, companyId);

      await assertActiveCompany(repository, context, companyId);

      const configuration = await repository.getSmtpConfiguration(context, companyId);

      if (configuration === undefined) {
        throw new ApiHttpError(
          'SMTP_CONFIGURATION_NOT_FOUND',
          404,
          'The company SMTP configuration was not found.',
        );
      }

      if (configuration.status !== 'active') {
        throw new ApiHttpError(
          'SMTP_CONFIGURATION_DISABLED',
          409,
          'The company SMTP configuration is disabled.',
        );
      }

      const recipientEmail = normalizeRequiredEmail(input.recipientEmail, 'recipientEmail');
      const eventId = await repository.createSmtpTestEvent(
        context,
        companyId,
        configuration.id,
        recipientEmail,
      );

      try {
        await mailTransport.sendTestEmail(
          {
            host: configuration.host,
            port: configuration.port,
            secureMode: configuration.secureMode,
            username: configuration.username,
            password: credentialCipher.decrypt({
              ciphertext: configuration.encryptedPassword,
              iv: configuration.passwordIv,
              authTag: configuration.passwordAuthTag,
            }),
          },
          {
            recipientEmail,
            senderEmail: configuration.senderEmail,
            senderName: configuration.senderName,
            replyToEmail: configuration.replyToEmail,
            subject: 'Affiliate Tracker SMTP Test',
            text: 'Your company SMTP configuration was verified successfully by Affiliate Tracker.',
          },
        );

        const completedAt = await repository.completeSmtpTestEvent(
          context,
          companyId,
          configuration.id,
          eventId,
          'sent',
          null,
        );

        return Object.freeze({
          eventId,
          status: 'sent',
          recipientEmail,
          completedAt,
        });
      } catch (error: unknown) {
        await repository.completeSmtpTestEvent(
          context,
          companyId,
          configuration.id,
          eventId,
          'failed',
          normalizeMailFailure(error),
        );

        throw new ApiHttpError(
          'SMTP_TEST_FAILED',
          502,
          'The SMTP test email could not be delivered.',
          {
            cause: error,
          },
        );
      }
    },
  });
}
