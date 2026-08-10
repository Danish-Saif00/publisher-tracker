export const FACTORY_RESET_OPENAPI_TAGS = [
  {
    name: 'Factory Reset',
    description:
      'Explicit destructive maintenance operations with typed confirmation and role-scoped authorization.',
  },
] as const;

export const FACTORY_RESET_OPENAPI_SCHEMAS = {
  FactoryResetRequest: {
    type: 'object',
    required: ['confirmation'],
    additionalProperties: false,
    properties: {
      confirmation: {
        type: 'string',
      },
    },
  },
  FactoryResetReport: {
    type: 'object',
    required: [
      'resetId',
      'scope',
      'companyId',
      'deletedTables',
      'deletedRecords',
      'authUsersTargeted',
      'externalResourcesTargeted',
      'storageObjectsTargeted',
      'authUsersPurged',
      'authUsersPending',
      'externalResourcesPurged',
      'externalResourcesPending',
      'storageObjectsPurged',
      'storageObjectsPending',
      'completed',
    ],
    properties: {
      resetId: { type: 'string', format: 'uuid' },
      scope: { type: 'string', enum: ['tracker', 'company'] },
      companyId: { type: ['string', 'null'], format: 'uuid' },
      deletedTables: { type: 'integer', minimum: 0 },
      deletedRecords: { type: 'integer', minimum: 0 },
      authUsersTargeted: { type: 'integer', minimum: 0 },
      externalResourcesTargeted: { type: 'integer', minimum: 0 },
      storageObjectsTargeted: { type: 'integer', minimum: 0 },
      authUsersPurged: { type: 'integer', minimum: 0 },
      authUsersPending: { type: 'integer', minimum: 0 },
      externalResourcesPurged: { type: 'integer', minimum: 0 },
      externalResourcesPending: { type: 'integer', minimum: 0 },
      storageObjectsPurged: { type: 'integer', minimum: 0 },
      storageObjectsPending: { type: 'integer', minimum: 0 },
      completed: { type: 'boolean' },
    },
  },
} as const;

const RESET_RESPONSES = {
  '200': {
    description:
      'Factory-reset database purge completed and managed-domain, Storage, and Auth cleanup were attempted.',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['data'],
          properties: {
            data: { $ref: '#/components/schemas/FactoryResetReport' },
          },
        },
      },
    },
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
} as const;

export const FACTORY_RESET_OPENAPI_PATHS = {
  '/platform/factory-reset': {
    post: {
      tags: ['Factory Reset'],
      summary: 'Reset every tenant while preserving Platform Super Admin identities.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/FactoryResetRequest' },
          },
        },
      },
      responses: RESET_RESPONSES,
    },
  },
  '/companies/{companyId}/factory-reset': {
    post: {
      tags: ['Factory Reset'],
      summary:
        'Reset one company while preserving the company, current Company Admin, and subscription.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { $ref: '#/components/parameters/CompanyId' },
        { $ref: '#/components/parameters/CompanyContext' },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/FactoryResetRequest' },
          },
        },
      },
      responses: RESET_RESPONSES,
    },
  },
} as const;
