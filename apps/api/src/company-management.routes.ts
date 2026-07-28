import type { CompanyMembershipStatus, CompanyRole } from '@affiliate-tracker/contracts';
import { Router, type Request, type RequestHandler } from 'express';

import { ApiHttpError } from './api.errors.js';
import type { CompanyManagementService } from './company-management.service.js';
import { getRequestContext, getResolvedIdentity } from './request-context.js';

export interface CreateCompanyManagementRouterOptions {
  readonly service: CompanyManagementService;
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

function readRequiredString(body: Record<string, unknown>, propertyName: string): string {
  const value = body[propertyName];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `${propertyName} must be a non-empty string.`,
    );
  }

  return value;
}

function readOptionalString(
  body: Record<string, unknown>,
  propertyName: string,
): string | undefined {
  const value = body[propertyName];

  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new ApiHttpError(
      'INVALID_REQUEST_BODY',
      400,
      `${propertyName} must be a string when provided.`,
    );
  }

  return value;
}

function readCompanyRole(body: Record<string, unknown>): CompanyRole {
  const value = body['role'];

  switch (value) {
    case 'company_admin':
    case 'manager':
    case 'publisher':
      return value;
    default:
      throw new ApiHttpError(
        'INVALID_REQUEST_BODY',
        400,
        'role must be company_admin, manager, or publisher.',
      );
  }
}

function readOptionalCompanyRole(body: Record<string, unknown>): CompanyRole | undefined {
  return body['role'] === undefined ? undefined : readCompanyRole(body);
}

function readOptionalMembershipStatus(
  body: Record<string, unknown>,
): CompanyMembershipStatus | undefined {
  const value = body['status'];

  switch (value) {
    case undefined:
      return undefined;
    case 'invited':
      return 'invited';
    case 'active':
      return 'active';
    case 'suspended':
      return 'suspended';
    case 'revoked':
      return 'revoked';
    default:
      throw new ApiHttpError(
        'INVALID_REQUEST_BODY',
        400,
        'status must be invited, active, suspended, or revoked.',
      );
  }
}

function readRouteParameter(request: Request, propertyName: string): string {
  const value = request.params[propertyName];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiHttpError('INVALID_PATH_PARAMETER', 400, `${propertyName} is required.`);
  }

  return value;
}

function resolveRequestInformation(request: Request) {
  return {
    identity: getResolvedIdentity(request),
    requestId: getRequestContext(request).requestId,
  };
}

export function createCompanyManagementRouter(
  options: CreateCompanyManagementRouterOptions,
): Router {
  const router = Router();

  const createCompanyHandler: RequestHandler = async (request, response): Promise<void> => {
    const body = readBody(request);
    const requestInformation = resolveRequestInformation(request);

    const timezone = readOptionalString(body, 'timezone');

    const company = await options.service.createCompany(
      requestInformation.identity,
      requestInformation.requestId,
      {
        slug: readRequiredString(body, 'slug'),
        name: readRequiredString(body, 'name'),
        ...(timezone !== undefined
          ? {
              timezone,
            }
          : {}),
      },
    );

    response.status(201).json({
      data: company,
    });
  };

  const listCompaniesHandler: RequestHandler = async (request, response): Promise<void> => {
    const requestInformation = resolveRequestInformation(request);

    const companies = await options.service.listCompanies(
      requestInformation.identity,
      requestInformation.requestId,
    );

    response.status(200).json({
      data: companies,
    });
  };

  const listAvailableCompaniesHandler: RequestHandler = async (
    request,
    response,
  ): Promise<void> => {
    const requestInformation = resolveRequestInformation(request);

    const companies = await options.service.listAvailableCompanies(
      requestInformation.identity,
      requestInformation.requestId,
    );

    response.status(200).json({
      data: companies,
    });
  };

  const getCompanyHandler: RequestHandler = async (request, response): Promise<void> => {
    const requestInformation = resolveRequestInformation(request);

    const company = await options.service.getCompany(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
    );

    response.status(200).json({
      data: company,
    });
  };

  const listMembershipsHandler: RequestHandler = async (request, response): Promise<void> => {
    const requestInformation = resolveRequestInformation(request);

    const memberships = await options.service.listMemberships(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
    );

    response.status(200).json({
      data: memberships,
    });
  };

  const inviteMembershipHandler: RequestHandler = async (request, response): Promise<void> => {
    const body = readBody(request);
    const requestInformation = resolveRequestInformation(request);

    const membership = await options.service.inviteMembership(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      {
        userId: readRequiredString(body, 'userId'),
        role: readCompanyRole(body),
      },
    );

    response.status(201).json({
      data: membership,
    });
  };

  const updateMembershipHandler: RequestHandler = async (request, response): Promise<void> => {
    const body = readBody(request);
    const requestInformation = resolveRequestInformation(request);
    const role = readOptionalCompanyRole(body);
    const status = readOptionalMembershipStatus(body);

    const membership = await options.service.updateMembership(
      requestInformation.identity,
      requestInformation.requestId,
      readRouteParameter(request, 'companyId'),
      readRouteParameter(request, 'membershipId'),
      {
        ...(role !== undefined
          ? {
              role,
            }
          : {}),
        ...(status !== undefined
          ? {
              status,
            }
          : {}),
      },
    );

    response.status(200).json({
      data: membership,
    });
  };

  router.post('/platform/companies', createCompanyHandler);

  router.get('/platform/companies', listCompaniesHandler);

  router.get('/me/companies', listAvailableCompaniesHandler);

  router.get('/companies/:companyId', getCompanyHandler);

  router.get('/companies/:companyId/memberships', listMembershipsHandler);

  router.post('/companies/:companyId/memberships', inviteMembershipHandler);

  router.patch('/companies/:companyId/memberships/:membershipId', updateMembershipHandler);

  return router;
}
