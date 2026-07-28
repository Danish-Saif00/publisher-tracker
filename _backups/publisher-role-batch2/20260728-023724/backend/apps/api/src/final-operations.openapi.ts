const bearerSecurity = Object.freeze([
  {
    bearerAuth: [],
  },
]);

const companyIdParameter = Object.freeze({
  in: 'path',
  name: 'companyId',
  required: true,
  schema: {
    type: 'string',
    format: 'uuid',
  },
});

const dimensionParameter = Object.freeze({
  in: 'path',
  name: 'dimension',
  required: true,
  schema: {
    type: 'string',
    enum: ['networks', 'offers', 'publishers'],
  },
});

const genericQueryParameters = Object.freeze([
  {
    in: 'query',
    name: 'from',
    schema: {
      type: 'string',
      format: 'date-time',
    },
  },
  {
    in: 'query',
    name: 'to',
    schema: {
      type: 'string',
      format: 'date-time',
    },
  },
  {
    in: 'query',
    name: 'search',
    schema: {
      type: 'string',
      maxLength: 160,
    },
  },
  {
    in: 'query',
    name: 'offerId',
    schema: {
      type: 'string',
      format: 'uuid',
    },
  },
  {
    in: 'query',
    name: 'networkAccountId',
    schema: {
      type: 'string',
      format: 'uuid',
    },
  },
  {
    in: 'query',
    name: 'ownerMembershipId',
    schema: {
      type: 'string',
      format: 'uuid',
    },
  },
  {
    in: 'query',
    name: 'countryCode',
    schema: {
      type: 'string',
      minLength: 2,
      maxLength: 2,
    },
  },
  {
    in: 'query',
    name: 'device',
    schema: {
      type: 'string',
      enum: ['desktop', 'mobile', 'tablet', 'other'],
    },
  },
  {
    in: 'query',
    name: 'limit',
    schema: {
      type: 'integer',
      minimum: 1,
      maximum: 500,
    },
  },
]);

function createListOperation(
  tag: string,
  summary: string,
  extraParameters: readonly unknown[] = [],
) {
  return Object.freeze({
    tags: [tag],
    summary,
    security: bearerSecurity,
    parameters: [
      companyIdParameter,
      ...genericQueryParameters,
      ...extraParameters,
    ],
    responses: {
      '200': {
        description: 'Successful response.',
      },
      '400': {
        description: 'Invalid request.',
      },
      '401': {
        description: 'Authentication required.',
      },
      '403': {
        description: 'Company access denied.',
      },
    },
  });
}

export const FINAL_OPERATIONS_OPENAPI_TAGS = Object.freeze([
  {
    name: 'Performance Reports',
    description: 'Tenant performance reporting by network, offer, and publisher.',
  },
  {
    name: 'Operational Logs',
    description: 'Click, conversion, session, and user-agent operational logs.',
  },
  {
    name: 'Account',
    description: 'Authenticated account profile preferences.',
  },
  {
    name: 'Billing Invoices',
    description: 'Subscription invoice snapshots.',
  },
]);

export const FINAL_OPERATIONS_OPENAPI_PATHS = Object.freeze({
  '/companies/{companyId}/reports/{dimension}': {
    get: {
      ...createListOperation(
        'Performance Reports',
        'List performance report rows.',
        [
          dimensionParameter,
          {
            in: 'query',
            name: 'dimensionStatus',
            schema: {
              type: 'string',
            },
          },
        ],
      ),
      parameters: [
        companyIdParameter,
        dimensionParameter,
        ...genericQueryParameters,
        {
          in: 'query',
          name: 'dimensionStatus',
          schema: {
            type: 'string',
          },
        },
      ],
    },
  },
  '/companies/{companyId}/logs/clicks': {
    get: createListOperation(
      'Operational Logs',
      'List click log rows.',
      [
        {
          in: 'query',
          name: 'status',
          schema: {
            type: 'string',
            enum: ['approved', 'rejected', 'unchecked'],
          },
        },
      ],
    ),
  },
  '/companies/{companyId}/logs/conversions': {
    get: createListOperation(
      'Operational Logs',
      'List conversion log rows.',
      [
        {
          in: 'query',
          name: 'status',
          schema: {
            type: 'string',
            enum: ['approved', 'rejected', 'unchecked'],
          },
        },
        {
          in: 'query',
          name: 'conversionStatus',
          schema: {
            type: 'string',
            enum: ['pending', 'approved', 'rejected', 'reversed'],
          },
        },
      ],
    ),
  },
  '/companies/{companyId}/logs/conversions/manual': {
    post: {
      tags: ['Operational Logs'],
      summary: 'Create an authorized manual conversion from a click ID.',
      security: bearerSecurity,
      parameters: [companyIdParameter],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/CreateManualConversionRequest',
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Manual conversion created.',
        },
        '400': {
          description: 'Invalid request.',
        },
        '403': {
          description: 'Operations access required.',
        },
        '409': {
          description: 'Click or payout configuration is unavailable.',
        },
      },
    },
  },
  '/companies/{companyId}/logs/sessions': {
    get: createListOperation(
      'Operational Logs',
      'List visitor sessions derived from captured clicks.',
    ),
  },
  '/companies/{companyId}/logs/user-agents': {
    get: createListOperation(
      'Operational Logs',
      'List user-agent aggregates.',
      [
        {
          in: 'query',
          name: 'status',
          schema: {
            type: 'string',
            enum: ['approved', 'rejected', 'unchecked'],
          },
        },
      ],
    ),
  },
  '/companies/{companyId}/billing/invoices': {
    get: {
      tags: ['Billing Invoices'],
      summary: 'List subscription invoices.',
      security: bearerSecurity,
      parameters: [
        companyIdParameter,
        {
          in: 'query',
          name: 'limit',
          schema: {
            type: 'integer',
            minimum: 1,
            maximum: 500,
          },
        },
      ],
      responses: {
        '200': {
          description: 'Invoice list.',
        },
        '403': {
          description: 'Company access denied.',
        },
      },
    },
  },
  '/me/profile': {
    get: {
      tags: ['Account'],
      summary: 'Get the authenticated account profile.',
      security: bearerSecurity,
      responses: {
        '200': {
          description: 'Account profile.',
        },
      },
    },
    put: {
      tags: ['Account'],
      summary: 'Update the authenticated account profile.',
      security: bearerSecurity,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/UpdateAccountProfileRequest',
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Updated account profile.',
        },
        '400': {
          description: 'Invalid profile data.',
        },
      },
    },
  },
});

export const FINAL_OPERATIONS_OPENAPI_SCHEMAS = Object.freeze({
  CreateManualConversionRequest: {
    type: 'object',
    additionalProperties: false,
    required: ['publicClickId', 'status'],
    properties: {
      publicClickId: {
        type: 'string',
        pattern: '^clk_[a-f0-9]{32}$',
      },
      status: {
        type: 'string',
        enum: ['pending', 'approved', 'rejected'],
      },
      revenueAmountMinor: {
        type: ['integer', 'null'],
        minimum: 0,
      },
      revenueCurrency: {
        type: ['string', 'null'],
        pattern: '^[A-Z]{3}$',
      },
    },
  },
  UpdateAccountProfileRequest: {
    type: 'object',
    additionalProperties: false,
    required: ['displayName', 'timezone'],
    properties: {
      displayName: {
        type: ['string', 'null'],
        maxLength: 120,
      },
      timezone: {
        type: 'string',
        minLength: 1,
        maxLength: 64,
      },
    },
  },
});
