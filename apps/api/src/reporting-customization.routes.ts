import { Router, type Request, type RequestHandler } from 'express';

import { ApiHttpError } from './api.errors.js';
import { getRequestContext, getResolvedIdentity } from './request-context.js';
import type { CompanyOperationsService } from './reporting-customization.service.js';
import type {
  CompanySmtpConfigurationStatus,
  CompanySmtpSecureMode,
} from './reporting-customization.types.js';

export interface CreateCompanyOperationsRouterOptions {
  readonly service: CompanyOperationsService;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBody(request: Request): Record<string, unknown> {
  const body = request.body as unknown;

  if (!isRecord(body)) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'The request body must be a JSON object.');
  }

  return body;
}

function readRouteParameter(request: Request, propertyName: string): string {
  const value = request.params[propertyName];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiHttpError('INVALID_PATH_PARAMETER', 400, `${propertyName} is required.`);
  }

  return value;
}

function readOptionalQueryString(request: Request, propertyName: string): string | undefined {
  const value = request.query[propertyName];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new ApiHttpError('INVALID_QUERY_PARAMETER', 400, `${propertyName} must be a string.`);
  }

  return value;
}

function readOptionalQueryInteger(request: Request, propertyName: string): number | undefined {
  const value = readOptionalQueryString(request, propertyName);

  if (value === undefined) {
    return undefined;
  }

  if (!/^\d+$/u.test(value)) {
    throw new ApiHttpError(
      'INVALID_QUERY_PARAMETER',
      400,
      `${propertyName} must be a whole number.`,
    );
  }

  return Number.parseInt(value, 10);
}

function readRequiredString(body: Record<string, unknown>, propertyName: string): string {
  const value = body[propertyName];

  if (typeof value !== 'string') {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be a string.`);
  }

  return value;
}

function readRequiredInteger(body: Record<string, unknown>, propertyName: string): number {
  const value = body[propertyName];

  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be a whole number.`);
  }

  return value;
}

function readOptionalNullableString(
  body: Record<string, unknown>,
  propertyName: string,
): string | null | undefined {
  const value = body[propertyName];

  if (value === undefined || value === null || typeof value === 'string') {
    return value;
  }

  throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be a string or null.`);
}

function readOptionalString(
  body: Record<string, unknown>,
  propertyName: string,
): string | undefined {
  const value = body[propertyName];

  if (value === undefined || typeof value === 'string') {
    return value;
  }

  throw new ApiHttpError('INVALID_REQUEST_BODY', 400, `${propertyName} must be a string.`);
}

function readRequiredSecureMode(body: Record<string, unknown>): CompanySmtpSecureMode {
  const value = body['secureMode'];

  if (value === 'plain' || value === 'starttls' || value === 'tls') {
    return value;
  }

  throw new ApiHttpError(
    'INVALID_REQUEST_BODY',
    400,
    'secureMode must be plain, starttls, or tls.',
  );
}

function readOptionalSmtpStatus(
  body: Record<string, unknown>,
): CompanySmtpConfigurationStatus | undefined {
  const value = body['status'];

  if (value === undefined || value === 'active' || value === 'disabled') {
    return value;
  }

  throw new ApiHttpError('INVALID_REQUEST_BODY', 400, 'status must be active or disabled.');
}

function resolveRequestInformation(request: Request): {
  readonly identity: ReturnType<typeof getResolvedIdentity>;
  readonly requestId: string;
} {
  return {
    identity: getResolvedIdentity(request),
    requestId: getRequestContext(request).requestId,
  };
}

export function createCompanyOperationsRouter(
  options: CreateCompanyOperationsRouterOptions,
): Router {
  const router = Router();

  const dashboardHandler: RequestHandler = async (request, response) => {
    const information = resolveRequestInformation(request);
    const from = readOptionalQueryString(request, 'from');
    const to = readOptionalQueryString(request, 'to');
    const offerId = readOptionalQueryString(request, 'offerId');
    const networkAccountId = readOptionalQueryString(request, 'networkAccountId');
    const ownerMembershipId = readOptionalQueryString(request, 'ownerMembershipId');
    const dashboard = await options.service.getReportingDashboard(
      information.identity,
      information.requestId,
      readRouteParameter(request, 'companyId'),
      {
        ...(from !== undefined ? { from } : {}),
        ...(to !== undefined ? { to } : {}),
        ...(offerId !== undefined ? { offerId } : {}),
        ...(networkAccountId !== undefined ? { networkAccountId } : {}),
        ...(ownerMembershipId !== undefined ? { ownerMembershipId } : {}),
      },
    );

    response.status(200).json({
      data: {
        dashboard,
      },
    });
  };

  const operationalEventsHandler: RequestHandler = async (request, response) => {
    const information = resolveRequestInformation(request);
    const eventName = readOptionalQueryString(request, 'eventName');
    const entityType = readOptionalQueryString(request, 'entityType');
    const from = readOptionalQueryString(request, 'from');
    const to = readOptionalQueryString(request, 'to');
    const limit = readOptionalQueryInteger(request, 'limit');
    const events = await options.service.listOperationalEvents(
      information.identity,
      information.requestId,
      readRouteParameter(request, 'companyId'),
      {
        ...(eventName !== undefined ? { eventName } : {}),
        ...(entityType !== undefined ? { entityType } : {}),
        ...(from !== undefined ? { from } : {}),
        ...(to !== undefined ? { to } : {}),
        ...(limit !== undefined ? { limit } : {}),
      },
    );

    response.status(200).json({
      data: {
        events,
      },
    });
  };

  const getCustomizationHandler: RequestHandler = async (request, response) => {
    const information = resolveRequestInformation(request);
    const customization = await options.service.getCustomization(
      information.identity,
      information.requestId,
      readRouteParameter(request, 'companyId'),
    );

    response.status(200).json({
      data: {
        customization,
      },
    });
  };

  const updateCustomizationHandler: RequestHandler = async (request, response) => {
    const information = resolveRequestInformation(request);
    const body = readBody(request);
    const brandName = readOptionalNullableString(body, 'brandName');
    const logoUrl = readOptionalNullableString(body, 'logoUrl');
    const primaryColor = readOptionalNullableString(body, 'primaryColor');
    const secondaryColor = readOptionalNullableString(body, 'secondaryColor');
    const supportEmail = readOptionalNullableString(body, 'supportEmail');
    const customization = await options.service.updateCustomization(
      information.identity,
      information.requestId,
      readRouteParameter(request, 'companyId'),
      {
        ...(brandName !== undefined ? { brandName } : {}),
        ...(logoUrl !== undefined ? { logoUrl } : {}),
        ...(primaryColor !== undefined ? { primaryColor } : {}),
        ...(secondaryColor !== undefined ? { secondaryColor } : {}),
        ...(supportEmail !== undefined ? { supportEmail } : {}),
      },
    );

    response.status(200).json({
      data: {
        customization,
      },
    });
  };

  const getSmtpHandler: RequestHandler = async (request, response) => {
    const information = resolveRequestInformation(request);
    const smtpConfiguration = await options.service.getSmtpConfiguration(
      information.identity,
      information.requestId,
      readRouteParameter(request, 'companyId'),
    );

    response.status(200).json({
      data: {
        smtpConfiguration,
      },
    });
  };

  const updateSmtpHandler: RequestHandler = async (request, response) => {
    const information = resolveRequestInformation(request);
    const body = readBody(request);
    const status = readOptionalSmtpStatus(body);
    const password = readOptionalString(body, 'password');
    const replyToEmail = readOptionalNullableString(body, 'replyToEmail');
    const smtpConfiguration = await options.service.updateSmtpConfiguration(
      information.identity,
      information.requestId,
      readRouteParameter(request, 'companyId'),
      {
        host: readRequiredString(body, 'host'),
        port: readRequiredInteger(body, 'port'),
        secureMode: readRequiredSecureMode(body),
        username: readRequiredString(body, 'username'),
        ...(password !== undefined ? { password } : {}),
        senderEmail: readRequiredString(body, 'senderEmail'),
        senderName: readRequiredString(body, 'senderName'),
        ...(replyToEmail !== undefined ? { replyToEmail } : {}),
        ...(status !== undefined ? { status } : {}),
      },
    );

    response.status(200).json({
      data: {
        smtpConfiguration,
      },
    });
  };

  const testSmtpHandler: RequestHandler = async (request, response) => {
    const information = resolveRequestInformation(request);
    const result = await options.service.testSmtpConfiguration(
      information.identity,
      information.requestId,
      readRouteParameter(request, 'companyId'),
      {
        recipientEmail: readRequiredString(readBody(request), 'recipientEmail'),
      },
    );

    response.status(200).json({
      data: {
        result,
      },
    });
  };

  router.get('/companies/:companyId/reporting/dashboard', dashboardHandler);
  router.get('/companies/:companyId/operations/events', operationalEventsHandler);
  router.get('/companies/:companyId/customization', getCustomizationHandler);
  router.put('/companies/:companyId/customization', updateCustomizationHandler);
  router.get('/companies/:companyId/smtp', getSmtpHandler);
  router.put('/companies/:companyId/smtp', updateSmtpHandler);
  router.post('/companies/:companyId/smtp/test', testSmtpHandler);

  return router;
}
