export const CONVERSION_POSTBACK_OPENAPI_TAGS = Object.freeze([
  Object.freeze({
    name: 'Postback Endpoints',
  }),
  Object.freeze({
    name: 'Conversions',
  }),
  Object.freeze({
    name: 'Public Postbacks',
  }),
]);

export const CONVERSION_POSTBACK_OPENAPI_SCHEMAS = Object.freeze({
  NetworkPostbackEndpoint: {
    type: 'object',
    required: [
      'id',
      'companyId',
      'networkAccountId',
      'networkAccountName',
      'name',
      'endpointKeyLast4',
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
      name: {
        type: 'string',
      },
      endpointKeyLast4: {
        type: 'string',
        pattern: '^[a-f0-9]{4}$',
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
  NetworkPostbackEndpointSecret: {
    type: 'object',
    required: ['endpoint', 'endpointKey'],
    properties: {
      endpoint: {
        $ref: '#/components/schemas/NetworkPostbackEndpoint',
      },
      endpointKey: {
        type: 'string',
        pattern: '^pbk_[a-f0-9]{48}$',
        description: 'Returned only when the endpoint key is created or rotated.',
      },
    },
  },
  Conversion: {
    type: 'object',
    required: [
      'id',
      'publicConversionId',
      'companyId',
      'publicClickId',
      'offerId',
      'networkAccountId',
      'ownerMembershipId',
      'externalConversionId',
      'source',
      'status',
      'payoutMode',
      'payoutAmountMinor',
      'payoutCurrency',
      'convertedAt',
    ],
    properties: {
      id: {
        type: 'string',
        format: 'uuid',
      },
      publicConversionId: {
        type: 'string',
        pattern: '^cnv_[a-f0-9]{32}$',
      },
      companyId: {
        type: 'string',
        format: 'uuid',
      },
      publicClickId: {
        type: 'string',
        pattern: '^clk_[a-f0-9]{32}$',
      },
      offerId: {
        type: 'string',
        format: 'uuid',
      },
      offerCode: {
        type: 'string',
      },
      offerName: {
        type: 'string',
      },
      networkAccountId: {
        type: 'string',
        format: 'uuid',
      },
      networkAccountName: {
        type: 'string',
      },
      ownerMembershipId: {
        type: 'string',
        format: 'uuid',
      },
      postbackEndpointId: {
        type: ['string', 'null'],
        format: 'uuid',
      },
      postbackEndpointName: {
        type: ['string', 'null'],
      },
      externalConversionId: {
        type: 'string',
      },
      source: {
        type: 'string',
        enum: ['provider_postback', 'manual'],
      },
      status: {
        type: 'string',
        enum: ['pending', 'approved', 'rejected', 'reversed'],
      },
      revenueAmountMinor: {
        type: ['integer', 'null'],
      },
      revenueCurrency: {
        type: ['string', 'null'],
        pattern: '^[A-Z]{3}$',
      },
      payoutMode: {
        type: 'string',
        enum: ['fixed_member', 'per_offer'],
      },
      payoutAmountMinor: {
        type: 'integer',
        minimum: 1,
      },
      payoutCurrency: {
        type: 'string',
        pattern: '^[A-Z]{3}$',
      },
      convertedAt: {
        type: 'string',
        format: 'date-time',
      },
    },
  },
  PublicPostbackResponse: {
    type: 'object',
    required: ['publicConversionId', 'status', 'wasIdempotent'],
    properties: {
      publicConversionId: {
        type: 'string',
        pattern: '^cnv_[a-f0-9]{32}$',
      },
      status: {
        type: 'string',
        enum: ['pending', 'approved', 'rejected', 'reversed'],
      },
      wasIdempotent: {
        type: 'boolean',
      },
    },
  },
});

const AUTHENTICATED_COMPANY_PARAMETERS = Object.freeze([
  Object.freeze({
    $ref: '#/components/parameters/CompanyId',
  }),
  Object.freeze({
    $ref: '#/components/parameters/CompanyContext',
  }),
]);

export const CONVERSION_POSTBACK_OPENAPI_PATHS = Object.freeze({
  '/companies/{companyId}/network-accounts/{networkAccountId}/postback-endpoints': {
    post: {
      tags: ['Postback Endpoints'],
      summary: 'Create a provider-agnostic network postback endpoint.',
      security: [
        {
          bearerAuth: [],
        },
      ],
      parameters: [
        ...AUTHENTICATED_COMPANY_PARAMETERS,
        {
          name: 'networkAccountId',
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
              type: 'object',
              required: ['name'],
              properties: {
                name: {
                  type: 'string',
                  minLength: 2,
                  maxLength: 160,
                },
                status: {
                  type: 'string',
                  enum: ['active', 'paused'],
                },
              },
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Endpoint created. Store the returned secret immediately.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    $ref: '#/components/schemas/NetworkPostbackEndpointSecret',
                  },
                },
              },
            },
          },
        },
      },
    },
    get: {
      tags: ['Postback Endpoints'],
      summary: 'List postback endpoints for a network account.',
      security: [
        {
          bearerAuth: [],
        },
      ],
      parameters: [
        ...AUTHENTICATED_COMPANY_PARAMETERS,
        {
          name: 'networkAccountId',
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
          description: 'Postback endpoint collection.',
        },
      },
    },
  },
  '/companies/{companyId}/network-accounts/{networkAccountId}/postback-endpoints/{endpointId}': {
    patch: {
      tags: ['Postback Endpoints'],
      summary: 'Update a postback endpoint lifecycle or display name.',
      security: [
        {
          bearerAuth: [],
        },
      ],
      responses: {
        '200': {
          description: 'Postback endpoint updated.',
        },
      },
    },
  },
  '/companies/{companyId}/network-accounts/{networkAccountId}/postback-endpoints/{endpointId}/rotate-key':
    {
      post: {
        tags: ['Postback Endpoints'],
        summary: 'Rotate a postback endpoint key and return the new secret once.',
        security: [
          {
            bearerAuth: [],
          },
        ],
        responses: {
          '200': {
            description: 'Postback endpoint key rotated.',
          },
        },
      },
    },
  '/companies/{companyId}/conversions': {
    get: {
      tags: ['Conversions'],
      summary: 'List conversions with immutable payout snapshots.',
      security: [
        {
          bearerAuth: [],
        },
      ],
      parameters: [...AUTHENTICATED_COMPANY_PARAMETERS],
      responses: {
        '200': {
          description: 'Conversion collection.',
        },
      },
    },
  },
  '/companies/{companyId}/conversions/{conversionId}': {
    get: {
      tags: ['Conversions'],
      summary: 'Read one conversion and its conversion-time payout snapshot.',
      security: [
        {
          bearerAuth: [],
        },
      ],
      parameters: [...AUTHENTICATED_COMPANY_PARAMETERS],
      responses: {
        '200': {
          description: 'Conversion details.',
        },
      },
    },
  },
  '/postbacks/{endpointKey}': {
    get: {
      tags: ['Public Postbacks'],
      summary: 'Ingest a provider conversion postback using query parameters.',
      servers: [
        {
          url: 'http://localhost:4100',
          description: 'Public tracker service',
        },
      ],
      parameters: [
        {
          name: 'endpointKey',
          in: 'path',
          required: true,
          schema: {
            type: 'string',
            pattern: '^pbk_[a-f0-9]{48}$',
          },
        },
        {
          name: 'click_id',
          in: 'query',
          required: true,
          schema: {
            type: 'string',
          },
        },
        {
          name: 'conversion_id',
          in: 'query',
          required: true,
          schema: {
            type: 'string',
          },
        },
        {
          name: 'status',
          in: 'query',
          required: true,
          schema: {
            type: 'string',
            enum: ['pending', 'approved', 'rejected', 'reversed'],
          },
        },
        {
          name: 'x-idempotency-key',
          in: 'header',
          required: true,
          schema: {
            type: 'string',
          },
        },
      ],
      responses: {
        '201': {
          description: 'Conversion created or updated.',
        },
        '200': {
          description: 'Idempotent replay accepted.',
        },
      },
    },
    post: {
      tags: ['Public Postbacks'],
      summary: 'Ingest a provider conversion postback using form or JSON data.',
      servers: [
        {
          url: 'http://localhost:4100',
          description: 'Public tracker service',
        },
      ],
      responses: {
        '201': {
          description: 'Conversion created or updated.',
        },
        '200': {
          description: 'Idempotent replay accepted.',
        },
      },
    },
  },
});
