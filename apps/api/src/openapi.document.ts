import {
  CATALOG_OPERATIONS_OPENAPI_PATHS,
  CATALOG_OPERATIONS_OPENAPI_SCHEMAS,
  CATALOG_OPERATIONS_OPENAPI_TAGS,
} from './catalog-operations.openapi.js';

import { OPENAPI_RECONCILIATION_PATHS } from './openapi.reconciliation.js';

import {
  FINAL_OPERATIONS_OPENAPI_PATHS,
  FINAL_OPERATIONS_OPENAPI_SCHEMAS,
  FINAL_OPERATIONS_OPENAPI_TAGS,
} from './final-operations.openapi.js';

import {
  MANAGED_USERS_OPENAPI_PATHS,
  MANAGED_USERS_OPENAPI_SCHEMAS,
  MANAGED_USERS_OPENAPI_TAGS,
} from './managed-users.openapi.js';

import {
  COMPANY_OPERATIONS_OPENAPI_PATHS,
  COMPANY_OPERATIONS_OPENAPI_SCHEMAS,
  COMPANY_OPERATIONS_OPENAPI_TAGS,
} from './reporting-customization.openapi.js';

import {
  CONVERSION_POSTBACK_OPENAPI_PATHS,
  CONVERSION_POSTBACK_OPENAPI_SCHEMAS,
  CONVERSION_POSTBACK_OPENAPI_TAGS,
} from './conversion-postbacks.openapi.js';

function normalizeBasePath(value: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue === '/' || normalizedValue.length === 0) {
    return '/';
  }

  return normalizedValue.startsWith('/')
    ? normalizedValue.replace(/\/+$/u, '')
    : `/${normalizedValue.replace(/\/+$/u, '')}`;
}

export function createOpenApiDocument(basePathValue: string): Readonly<Record<string, unknown>> {
  const basePath = normalizeBasePath(basePathValue);

  return Object.freeze({
    openapi: '3.1.0',
    info: {
      title: 'Affiliate Tracker Administrative API',
      version: '0.1.0',
      description:
        'Administrative API for multi-company affiliate tracking, attribution, duplicate protection, and fraud review.',
    },
    servers: [
      {
        url: basePath,
        description: 'Configured administrative API base path',
      },
    ],
    tags: [
      ...CATALOG_OPERATIONS_OPENAPI_TAGS,
      ...FINAL_OPERATIONS_OPENAPI_TAGS,
      ...COMPANY_OPERATIONS_OPENAPI_TAGS,
      ...CONVERSION_POSTBACK_OPENAPI_TAGS,
      ...MANAGED_USERS_OPENAPI_TAGS,
      {
        name: 'Authentication',
      },
      {
        name: 'Tracking Links',
      },
      {
        name: 'Duplicate Protection',
      },
      {
        name: 'Fraud Review',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      parameters: {
        CompanyId: {
          name: 'companyId',
          in: 'path',
          required: true,
          schema: {
            type: 'string',
            format: 'uuid',
          },
        },
        CompanyContext: {
          name: 'x-company-id',
          in: 'header',
          required: true,
          schema: {
            type: 'string',
            format: 'uuid',
          },
          description: 'Must match the companyId route parameter.',
        },
      },
      schemas: {
        ...CATALOG_OPERATIONS_OPENAPI_SCHEMAS,
        ...FINAL_OPERATIONS_OPENAPI_SCHEMAS,
        ...COMPANY_OPERATIONS_OPENAPI_SCHEMAS,
        ...CONVERSION_POSTBACK_OPENAPI_SCHEMAS,
        ...MANAGED_USERS_OPENAPI_SCHEMAS,
        TrackingLink: {
          type: 'object',
          required: [
            'id',
            'companyId',
            'offerId',
            'offerCode',
            'offerName',
            'trackingDomainId',
            'hostname',
            'ownerMembershipId',
            'ownerUserId',
            'ownerRole',
            'ownerMembershipStatus',
            'trackingCode',
            'customSlug',
            'destinationUrl',
            'queryParameters',
            'source',
            'status',
            'createdBy',
            'updatedBy',
            'createdAt',
            'updatedAt',
          ],
          properties: {
            id: { type: 'string', format: 'uuid' },
            companyId: { type: 'string', format: 'uuid' },
            offerId: { type: 'string', format: 'uuid' },
            offerCode: { type: 'string' },
            offerName: { type: 'string' },
            trackingDomainId: { type: 'string', format: 'uuid' },
            hostname: { type: 'string' },
            ownerMembershipId: { type: 'string', format: 'uuid' },
            ownerUserId: { type: 'string', format: 'uuid' },
            ownerRole: { type: 'string', enum: ['manager', 'publisher'] },
            ownerMembershipStatus: {
              type: 'string',
              enum: ['invited', 'active', 'suspended', 'revoked'],
            },
            trackingCode: { type: 'string' },
            customSlug: { type: ['string', 'null'] },
            destinationUrl: { type: 'string', format: 'uri' },
            queryParameters: {
              type: 'object',
              additionalProperties: { type: 'string' },
            },
            source: {
              type: 'string',
              enum: ['manual', 'publisher_assignment'],
            },
            status: {
              type: 'string',
              enum: ['draft', 'active', 'paused', 'archived'],
            },
            createdBy: { type: ['string', 'null'], format: 'uuid' },
            updatedBy: { type: ['string', 'null'], format: 'uuid' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        TrackingLinkDeleteResult: {
          type: 'object',
          required: ['id', 'deleted'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            deleted: { type: 'boolean', const: true },
          },
        },
        ApiError: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message', 'requestId'],
              properties: {
                code: {
                  type: 'string',
                },
                message: {
                  type: 'string',
                },
                requestId: {
                  type: 'string',
                },
              },
            },
          },
        },
        DuplicateProtectionRule: {
          type: 'object',
          required: [
            'id',
            'companyId',
            'networkAccountId',
            'name',
            'lockMode',
            'matchVisitorId',
            'matchIpAndUserAgent',
            'rapidRepeatWindowSeconds',
            'rapidRepeatThreshold',
            'status',
            'createdAt',
            'updatedAt',
          ],
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },
            companyId: {
              type: 'string',
              format: 'uuid',
            },
            networkAccountId: {
              type: 'string',
              format: 'uuid',
            },
            networkAccountName: {
              type: 'string',
            },
            offerId: {
              type: ['string', 'null'],
              format: 'uuid',
            },
            offerCode: {
              type: ['string', 'null'],
            },
            offerName: {
              type: ['string', 'null'],
            },
            name: {
              type: 'string',
            },
            lockMode: {
              type: 'string',
              enum: ['session', 'duration', 'until_date', 'until_offer_expiry', 'permanent'],
            },
            sessionWindowSeconds: {
              type: ['integer', 'null'],
            },
            lockDurationSeconds: {
              type: ['integer', 'null'],
            },
            lockUntil: {
              type: ['string', 'null'],
              format: 'date-time',
            },
            offerExpiryAt: {
              type: ['string', 'null'],
              format: 'date-time',
            },
            matchVisitorId: {
              type: 'boolean',
            },
            matchIpAndUserAgent: {
              type: 'boolean',
            },
            rapidRepeatWindowSeconds: {
              type: 'integer',
            },
            rapidRepeatThreshold: {
              type: 'integer',
            },
            status: {
              type: 'string',
              enum: ['active', 'paused', 'archived'],
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
        DuplicateProtectionRuleInput: {
          type: 'object',
          required: ['networkAccountId', 'name', 'lockMode'],
          properties: {
            networkAccountId: {
              type: 'string',
              format: 'uuid',
            },
            offerId: {
              type: ['string', 'null'],
              format: 'uuid',
            },
            name: {
              type: 'string',
              minLength: 2,
              maxLength: 160,
            },
            lockMode: {
              type: 'string',
              enum: ['session', 'duration', 'until_date', 'until_offer_expiry', 'permanent'],
            },
            sessionWindowSeconds: {
              type: ['integer', 'null'],
              minimum: 30,
            },
            lockDurationSeconds: {
              type: ['integer', 'null'],
              minimum: 30,
            },
            lockUntil: {
              type: ['string', 'null'],
              format: 'date-time',
            },
            offerExpiryAt: {
              type: ['string', 'null'],
              format: 'date-time',
            },
            matchVisitorId: {
              type: 'boolean',
              default: true,
            },
            matchIpAndUserAgent: {
              type: 'boolean',
              default: true,
            },
            rapidRepeatWindowSeconds: {
              type: 'integer',
              minimum: 10,
              default: 60,
            },
            rapidRepeatThreshold: {
              type: 'integer',
              minimum: 2,
              default: 5,
            },
            status: {
              type: 'string',
              enum: ['active', 'paused'],
              default: 'active',
            },
          },
        },
        FraudClick: {
          type: 'object',
          required: [
            'id',
            'publicClickId',
            'companyId',
            'trackingLinkId',
            'offerId',
            'networkAccountId',
            'duplicateDecision',
            'fraudRiskLevel',
            'fraudSignals',
            'attributionEligible',
            'capturedAt',
          ],
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
            },
            publicClickId: {
              type: 'string',
              pattern: '^clk_[a-f0-9]{32}$',
            },
            companyId: {
              type: 'string',
              format: 'uuid',
            },
            trackingLinkId: {
              type: 'string',
              format: 'uuid',
            },
            offerId: {
              type: 'string',
              format: 'uuid',
            },
            networkAccountId: {
              type: 'string',
              format: 'uuid',
            },
            duplicateDecision: {
              type: 'string',
              enum: ['accepted', 'duplicate'],
            },
            duplicateReason: {
              type: ['string', 'null'],
            },
            duplicateOfClickId: {
              type: ['string', 'null'],
              format: 'uuid',
            },
            duplicateRuleId: {
              type: ['string', 'null'],
              format: 'uuid',
            },
            lockExpiresAt: {
              type: ['string', 'null'],
              format: 'date-time',
            },
            fraudRiskLevel: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
            },
            fraudSignals: {
              type: 'array',
              items: {
                type: 'string',
              },
            },
            attributionEligible: {
              type: 'boolean',
            },
            capturedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
      },
      responses: {
        BadRequest: {
          description: 'The request is invalid.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ApiError',
              },
            },
          },
        },
        Unauthorized: {
          description: 'Authentication is required.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ApiError',
              },
            },
          },
        },
        Forbidden: {
          description: 'The authenticated user is not authorized.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ApiError',
              },
            },
          },
        },
        NotFound: {
          description: 'The requested resource was not found.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ApiError',
              },
            },
          },
        },
        Conflict: {
          description: 'The request conflicts with current state.',
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ApiError',
              },
            },
          },
        },
      },
    },
    paths: {
      ...OPENAPI_RECONCILIATION_PATHS,
      ...CATALOG_OPERATIONS_OPENAPI_PATHS,
      ...FINAL_OPERATIONS_OPENAPI_PATHS,
      ...COMPANY_OPERATIONS_OPENAPI_PATHS,
      ...CONVERSION_POSTBACK_OPENAPI_PATHS,
      ...MANAGED_USERS_OPENAPI_PATHS,
      '/auth/me': {
        get: {
          tags: ['Authentication'],
          summary: 'Return the authenticated actor and company authorization context.',
          security: [
            {
              bearerAuth: [],
            },
          ],
          responses: {
            '200': {
              description: 'Authenticated identity.',
            },
            '401': {
              $ref: '#/components/responses/Unauthorized',
            },
          },
        },
      },
      '/companies/{companyId}/tracking-links': {
        get: {
          tags: ['Tracking Links'],
          summary: 'List tracking links visible to the authenticated company member.',
          security: [
            {
              bearerAuth: [],
            },
          ],
          parameters: [
            {
              $ref: '#/components/parameters/CompanyId',
            },
            {
              $ref: '#/components/parameters/CompanyContext',
            },
          ],
          responses: {
            '200': {
              description: 'Tracking-link collection.',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/TrackingLink' },
                  },
                },
              },
            },
          },
        },
        post: {
          tags: ['Tracking Links'],
          summary: 'Create a tracking link.',
          security: [
            {
              bearerAuth: [],
            },
          ],
          parameters: [
            {
              $ref: '#/components/parameters/CompanyId',
            },
            {
              $ref: '#/components/parameters/CompanyContext',
            },
          ],
          responses: {
            '201': {
              description: 'Manual tracking link created.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/TrackingLink' },
                },
              },
            },
          },
        },
      },
      '/companies/{companyId}/tracking-links/{linkId}/clone': {
        post: {
          tags: ['Tracking Links'],
          summary: 'Clone a tracking link into a fresh manual draft link.',
          security: [
            {
              bearerAuth: [],
            },
          ],
          parameters: [
            {
              $ref: '#/components/parameters/CompanyId',
            },
            {
              name: 'linkId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
            {
              $ref: '#/components/parameters/CompanyContext',
            },
          ],
          responses: {
            '201': {
              description: 'Fresh manual draft tracking link cloned without traffic history.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/TrackingLink' },
                },
              },
            },
            '409': {
              $ref: '#/components/responses/Conflict',
            },
          },
        },
      },
      '/companies/{companyId}/tracking-links/{linkId}/archive': {
        post: {
          tags: ['Tracking Links'],
          summary: 'Archive a tracking link without changing its configuration.',
          security: [
            {
              bearerAuth: [],
            },
          ],
          parameters: [
            {
              $ref: '#/components/parameters/CompanyId',
            },
            {
              name: 'linkId',
              in: 'path',
              required: true,
              schema: { type: 'string', format: 'uuid' },
            },
            {
              $ref: '#/components/parameters/CompanyContext',
            },
          ],
          responses: {
            '200': {
              description: 'Tracking link archived.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/TrackingLink' },
                },
              },
            },
            '409': {
              $ref: '#/components/responses/Conflict',
            },
          },
        },
      },
      '/companies/{companyId}/duplicate-protection-rules': {
        get: {
          tags: ['Duplicate Protection'],
          summary: 'List duplicate-protection rules for a company.',
          security: [
            {
              bearerAuth: [],
            },
          ],
          parameters: [
            {
              $ref: '#/components/parameters/CompanyId',
            },
            {
              $ref: '#/components/parameters/CompanyContext',
            },
            {
              name: 'networkAccountId',
              in: 'query',
              schema: {
                type: 'string',
                format: 'uuid',
              },
            },
            {
              name: 'offerId',
              in: 'query',
              schema: {
                type: 'string',
                format: 'uuid',
              },
            },
            {
              name: 'status',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['active', 'paused', 'archived'],
              },
            },
          ],
          responses: {
            '200': {
              description: 'Duplicate-protection rules.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'object',
                        properties: {
                          rules: {
                            type: 'array',
                            items: {
                              $ref: '#/components/schemas/DuplicateProtectionRule',
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            '401': {
              $ref: '#/components/responses/Unauthorized',
            },
            '403': {
              $ref: '#/components/responses/Forbidden',
            },
          },
        },
        post: {
          tags: ['Duplicate Protection'],
          summary: 'Create a network-account or offer-scoped duplicate-protection rule.',
          security: [
            {
              bearerAuth: [],
            },
          ],
          parameters: [
            {
              $ref: '#/components/parameters/CompanyId',
            },
            {
              $ref: '#/components/parameters/CompanyContext',
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/DuplicateProtectionRuleInput',
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Duplicate-protection rule created.',
            },
            '400': {
              $ref: '#/components/responses/BadRequest',
            },
            '401': {
              $ref: '#/components/responses/Unauthorized',
            },
            '403': {
              $ref: '#/components/responses/Forbidden',
            },
            '409': {
              $ref: '#/components/responses/Conflict',
            },
          },
        },
      },
      '/companies/{companyId}/duplicate-protection-rules/{ruleId}': {
        get: {
          tags: ['Duplicate Protection'],
          summary: 'Read one duplicate-protection rule.',
          security: [
            {
              bearerAuth: [],
            },
          ],
          parameters: [
            {
              $ref: '#/components/parameters/CompanyId',
            },
            {
              $ref: '#/components/parameters/CompanyContext',
            },
            {
              name: 'ruleId',
              in: 'path',
              required: true,
              schema: {
                type: 'string',
                format: 'uuid',
              },
            },
          ],
          responses: {
            '200': {
              description: 'Duplicate-protection rule.',
            },
            '404': {
              $ref: '#/components/responses/NotFound',
            },
          },
        },
        patch: {
          tags: ['Duplicate Protection'],
          summary: 'Update a duplicate-protection rule.',
          security: [
            {
              bearerAuth: [],
            },
          ],
          parameters: [
            {
              $ref: '#/components/parameters/CompanyId',
            },
            {
              $ref: '#/components/parameters/CompanyContext',
            },
            {
              name: 'ruleId',
              in: 'path',
              required: true,
              schema: {
                type: 'string',
                format: 'uuid',
              },
            },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    {
                      $ref: '#/components/schemas/DuplicateProtectionRuleInput',
                    },
                  ],
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Duplicate-protection rule updated.',
            },
            '409': {
              $ref: '#/components/responses/Conflict',
            },
          },
        },
      },
      '/companies/{companyId}/fraud-clicks': {
        get: {
          tags: ['Fraud Review'],
          summary: 'List duplicate decisions and fraud signals for captured clicks.',
          security: [
            {
              bearerAuth: [],
            },
          ],
          parameters: [
            {
              $ref: '#/components/parameters/CompanyId',
            },
            {
              $ref: '#/components/parameters/CompanyContext',
            },
            {
              name: 'duplicateDecision',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['accepted', 'duplicate'],
              },
            },
            {
              name: 'fraudRiskLevel',
              in: 'query',
              schema: {
                type: 'string',
                enum: ['low', 'medium', 'high'],
              },
            },
            {
              name: 'limit',
              in: 'query',
              schema: {
                type: 'integer',
                minimum: 1,
                maximum: 200,
                default: 100,
              },
            },
          ],
          responses: {
            '200': {
              description: 'Fraud-review click collection.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: {
                        type: 'object',
                        properties: {
                          clicks: {
                            type: 'array',
                            items: {
                              $ref: '#/components/schemas/FraudClick',
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
}
