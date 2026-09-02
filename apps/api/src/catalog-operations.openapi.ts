const COMPANY_PARAMETERS = [
  { $ref: '#/components/parameters/CompanyId' },
  { $ref: '#/components/parameters/CompanyContext' },
] as const;

function authenticatedOperation(
  summary: string,
  extra: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    tags: ['Core Catalog'],
    summary,
    security: [{ bearerAuth: [] }],
    ...extra,
  });
}

export const CATALOG_OPERATIONS_OPENAPI_TAGS = Object.freeze([
  {
    name: 'Core Catalog',
    description:
      'Company-scoped Domains, Networks, Offers, Manager assignments, and Publisher operational settings.',
  },
]);

export const CATALOG_OPERATIONS_OPENAPI_SCHEMAS = Object.freeze({
  CatalogPublisherOffer: {
    type: 'object',
    required: [
      'id',
      'publicId',
      'publisherPublicId',
      'name',
      'description',
      'countries',
      'devices',
      'trackingDomainId',
      'trackingDomainHostname',
      'trackingLink',
      'promotionalText',
      'payoutAmountMinor',
      'payoutCurrency',
      'timezone',
      'activeDays',
      'activeStartTime',
      'activeEndTime',
      'expiresAt',
      'updatedAt',
    ],
    properties: {
      id: { type: 'string', format: 'uuid' },
      publicId: { type: 'integer', minimum: 1 },
      publisherPublicId: { type: 'integer', minimum: 1 },
      name: { type: 'string', minLength: 2, maxLength: 160 },
      description: { type: ['string', 'null'], maxLength: 4000 },
      countries: {
        type: 'array',
        uniqueItems: true,
        items: { type: 'string', pattern: '^[A-Z]{2}$' },
      },
      devices: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        uniqueItems: true,
        items: { type: 'string', enum: ['desktop', 'android', 'ios'] },
      },
      trackingDomainId: { type: ['string', 'null'], format: 'uuid' },
      trackingDomainHostname: { type: ['string', 'null'] },
      trackingLink: { type: ['string', 'null'], format: 'uri' },
      promotionalText: { type: ['string', 'null'], maxLength: 4000 },
      payoutAmountMinor: { type: ['integer', 'null'], minimum: 1 },
      payoutCurrency: { type: ['string', 'null'], pattern: '^[A-Z]{3}$' },
      timezone: { type: 'string', minLength: 1, maxLength: 64 },
      activeDays: {
        type: 'array',
        minItems: 1,
        maxItems: 7,
        uniqueItems: true,
        items: { type: 'integer', minimum: 1, maximum: 7 },
      },
      activeStartTime: { type: ['string', 'null'] },
      activeEndTime: { type: ['string', 'null'] },
      expiresAt: { type: ['string', 'null'], format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  CatalogOfferConfigurationInput: {
    type: 'object',
    required: [
      'trackingDomainId',
      'promotionalTextTemplate',
      'countries',
      'devices',
      'redirectType',
      'referrerMode',
      'timezone',
      'activeDays',
      'proxyEnabled',
      'duplicateAllowed',
      'managerMembershipIds',
    ],
    properties: {
      trackingDomainId: { type: 'string', format: 'uuid' },
      promotionalTextTemplate: {
        type: 'string',
        minLength: 1,
        maxLength: 2000,
        description:
          'Promotional copy template. Supported placeholders: %OFFER_NAME%, %OFFER_ID%, %PUB_ID%, %COUNTRIES%, %DEVICES%, %PAYOUT%, and %TRACKING_LINK%.',
      },
      countries: {
        type: 'array',
        maxItems: 250,
        uniqueItems: true,
        items: { type: 'string', pattern: '^[A-Z]{2}$' },
      },
      devices: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        uniqueItems: true,
        items: { type: 'string', enum: ['desktop', 'android', 'ios'] },
      },
      desktopUrl: { type: ['string', 'null'], format: 'uri' },
      androidUrl: { type: ['string', 'null'], format: 'uri' },
      iosUrl: { type: ['string', 'null'], format: 'uri' },
      redirectType: { type: 'string', enum: ['301', '302'] },
      referrerMode: { type: 'string', enum: ['preserve', 'strip'] },
      defaultPayoutAmountMinor: { type: ['integer', 'null'], minimum: 1 },
      payoutCurrency: { type: ['string', 'null'], pattern: '^[A-Z]{3}$' },
      timezone: { type: 'string', minLength: 1, maxLength: 64 },
      activeDays: {
        type: 'array',
        minItems: 1,
        maxItems: 7,
        uniqueItems: true,
        items: { type: 'integer', minimum: 1, maximum: 7 },
      },
      activeStartTime: { type: ['string', 'null'] },
      activeEndTime: { type: ['string', 'null'] },
      proxyEnabled: { type: 'boolean' },
      expiresAt: { type: ['string', 'null'], format: 'date-time' },
      duplicateAllowed: { type: 'boolean' },
      managerMembershipIds: {
        type: 'array',
        uniqueItems: true,
        items: { type: 'string', format: 'uuid' },
      },
    },
  },
  CreateCatalogOfferInput: {
    allOf: [
      { $ref: '#/components/schemas/CatalogOfferConfigurationInput' },
      {
        type: 'object',
        required: ['networkAccountId', 'code', 'name'],
        properties: {
          networkAccountId: { type: 'string', format: 'uuid' },
          code: { type: 'string', minLength: 2, maxLength: 80 },
          externalOfferId: { type: ['string', 'null'], maxLength: 255 },
          name: { type: 'string', minLength: 2, maxLength: 160 },
          description: { type: ['string', 'null'], maxLength: 4000 },
          socialPreviewTitle: {
            type: ['string', 'null'],
            maxLength: 160,
            description:
              'Optional public social-share title. When omitted, the internal offer name is used.',
          },
          socialPreviewDescription: {
            type: ['string', 'null'],
            maxLength: 300,
            description:
              'Optional public social-share description. When omitted, the tracker uses its standard browser instruction.',
          },
          socialPreviewImageUrl: {
            type: ['string', 'null'],
            format: 'uri',
            maxLength: 2048,
            description:
              'Optional offer-specific social-share image URL. When omitted, the company logo may be used as fallback.',
          },
          status: { type: 'string', enum: ['draft', 'active'] },
        },
      },
    ],
  },
  CloneCatalogOfferInput: {
    allOf: [
      { $ref: '#/components/schemas/CatalogOfferConfigurationInput' },
      {
        type: 'object',
        required: ['networkAccountId', 'code', 'name'],
        properties: {
          networkAccountId: { type: 'string', format: 'uuid' },
          code: { type: 'string', minLength: 2, maxLength: 80 },
          externalOfferId: { type: ['string', 'null'], maxLength: 255 },
          name: { type: 'string', minLength: 2, maxLength: 160 },
          description: { type: ['string', 'null'], maxLength: 4000 },
          socialPreviewTitle: {
            type: ['string', 'null'],
            maxLength: 160,
            description:
              'Optional public social-share title. When omitted, the internal offer name is used.',
          },
          socialPreviewDescription: {
            type: ['string', 'null'],
            maxLength: 300,
            description:
              'Optional public social-share description. When omitted, the tracker uses its standard browser instruction.',
          },
          socialPreviewImageUrl: {
            type: ['string', 'null'],
            format: 'uri',
            maxLength: 2048,
            description:
              'Optional offer-specific social-share image URL. When omitted, the company logo may be used as fallback.',
          },
        },
      },
    ],
  },
  UpdateCatalogOfferInput: {
    allOf: [
      { $ref: '#/components/schemas/CatalogOfferConfigurationInput' },
      {
        type: 'object',
        required: ['networkAccountId', 'name', 'status'],
        properties: {
          networkAccountId: { type: 'string', format: 'uuid' },
          externalOfferId: { type: ['string', 'null'], maxLength: 255 },
          name: { type: 'string', minLength: 2, maxLength: 160 },
          description: { type: ['string', 'null'], maxLength: 4000 },
          socialPreviewTitle: {
            type: ['string', 'null'],
            maxLength: 160,
            description:
              'Optional public social-share title. When omitted, the internal offer name is used.',
          },
          socialPreviewDescription: {
            type: ['string', 'null'],
            maxLength: 300,
            description:
              'Optional public social-share description. When omitted, the tracker uses its standard browser instruction.',
          },
          socialPreviewImageUrl: {
            type: ['string', 'null'],
            format: 'uri',
            maxLength: 2048,
            description:
              'Optional offer-specific social-share image URL. When omitted, the company logo may be used as fallback.',
          },
          status: { type: 'string', enum: ['draft', 'active', 'paused', 'archived'] },
        },
      },
    ],
  },
  CreateCatalogNetworkInput: {
    type: 'object',
    required: ['providerId', 'name', 'duplicateAllowed'],
    properties: {
      providerId: { type: 'string', format: 'uuid' },
      name: { type: 'string', minLength: 2, maxLength: 160 },
      externalAccountId: { type: ['string', 'null'], maxLength: 255 },
      trackingParameter: {
        type: ['string', 'null'],
        maxLength: 120,
        description:
          'Optional Network override. When null, the Provider default is used; click_id remains the final fallback.',
      },
      postbackUrl: { type: ['string', 'null'], format: 'uri' },
      duplicateAllowed: { type: 'boolean' },
    },
  },
  CloneCatalogNetworkInput: {
    type: 'object',
    required: ['name'],
    properties: {
      providerId: { type: 'string', format: 'uuid' },
      name: { type: 'string', minLength: 2, maxLength: 160 },
      externalAccountId: { type: ['string', 'null'], maxLength: 255 },
      trackingParameter: {
        type: ['string', 'null'],
        maxLength: 120,
        description:
          'Optional Network override. When null, the Provider default is used; click_id remains the final fallback.',
      },
      postbackUrl: { type: ['string', 'null'], format: 'uri' },
      duplicateAllowed: { type: 'boolean' },
    },
  },
  UpdateCatalogNetworkInput: {
    type: 'object',
    required: ['providerId', 'name', 'status', 'duplicateAllowed'],
    properties: {
      providerId: { type: 'string', format: 'uuid' },
      name: { type: 'string', minLength: 2, maxLength: 160 },
      externalAccountId: { type: ['string', 'null'], maxLength: 255 },
      status: { type: 'string', enum: ['active', 'suspended', 'archived'] },
      trackingParameter: {
        type: ['string', 'null'],
        maxLength: 120,
        description:
          'Optional Network override. When null, the Provider default is used; click_id remains the final fallback.',
      },
      postbackUrl: { type: ['string', 'null'], format: 'uri' },
      duplicateAllowed: { type: 'boolean' },
    },
  },
  UpdateCatalogPublisherInput: {
    type: 'object',
    required: ['timezone', 'payoutType', 'emailNotificationsEnabled', 'assignedOfferIds'],
    properties: {
      timezone: { type: 'string', minLength: 1, maxLength: 64 },
      payoutType: { type: 'string', enum: ['fixed_member', 'per_offer'] },
      fixedPayoutAmountMinor: { type: ['integer', 'null'], minimum: 1 },
      payoutCurrency: { type: ['string', 'null'], pattern: '^[A-Z]{3}$' },
      postbackUrl: { type: ['string', 'null'], format: 'uri' },
      emailNotificationsEnabled: { type: 'boolean' },
      assignedOfferIds: {
        type: 'array',
        uniqueItems: true,
        items: { type: 'string', format: 'uuid' },
      },
    },
  },
});

const JSON_BODY = (schemaReference: string): Readonly<Record<string, unknown>> =>
  Object.freeze({
    required: true,
    content: {
      'application/json': {
        schema: { $ref: schemaReference },
      },
    },
  });

const ENTITY_ID_PARAMETER = (name: string): Readonly<Record<string, unknown>> =>
  Object.freeze({
    name,
    in: 'path',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  });

export const CATALOG_OPERATIONS_OPENAPI_PATHS = Object.freeze({
  '/companies/{companyId}/catalog': {
    get: authenticatedOperation('Read the complete operational catalog snapshot.', {
      parameters: COMPANY_PARAMETERS,
      responses: {
        '200': { description: 'Core catalog snapshot.' },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': { $ref: '#/components/responses/NotFound' },
      },
    }),
  },
  '/companies/{companyId}/catalog/publisher-offers': {
    get: authenticatedOperation('List active Offers assigned to the authenticated Publisher.', {
      parameters: COMPANY_PARAMETERS,
      responses: {
        '200': {
          description: 'Publisher-safe assigned Offer directory.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['data'],
                properties: {
                  data: {
                    type: 'object',
                    required: ['offers'],
                    properties: {
                      offers: {
                        type: 'array',
                        items: {
                          $ref: '#/components/schemas/CatalogPublisherOffer',
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        '401': { $ref: '#/components/responses/Unauthorized' },
        '403': { $ref: '#/components/responses/Forbidden' },
        '404': { $ref: '#/components/responses/NotFound' },
      },
    }),
  },
  '/companies/{companyId}/catalog/offers': {
    post: authenticatedOperation('Create an operational offer.', {
      parameters: COMPANY_PARAMETERS,
      requestBody: JSON_BODY('#/components/schemas/CreateCatalogOfferInput'),
      responses: {
        '201': { description: 'Offer created.' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    }),
  },
  '/companies/{companyId}/catalog/offers/{offerId}/clone': {
    post: authenticatedOperation('Clone an operational offer without traffic history.', {
      parameters: [...COMPANY_PARAMETERS, ENTITY_ID_PARAMETER('offerId')],
      requestBody: JSON_BODY('#/components/schemas/CloneCatalogOfferInput'),
      responses: {
        '201': { description: 'Offer cloned as a new draft.' },
        '404': { $ref: '#/components/responses/NotFound' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    }),
  },
  '/companies/{companyId}/catalog/offers/{offerId}': {
    put: authenticatedOperation('Update an operational offer.', {
      parameters: [...COMPANY_PARAMETERS, ENTITY_ID_PARAMETER('offerId')],
      requestBody: JSON_BODY('#/components/schemas/UpdateCatalogOfferInput'),
      responses: {
        '200': { description: 'Offer updated.' },
        '404': { $ref: '#/components/responses/NotFound' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    }),
    delete: authenticatedOperation('Permanently delete an archived unused offer.', {
      parameters: [...COMPANY_PARAMETERS, ENTITY_ID_PARAMETER('offerId')],
      responses: {
        '200': { description: 'Offer permanently deleted.' },
        '404': { $ref: '#/components/responses/NotFound' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    }),
  },
  '/companies/{companyId}/catalog/networks': {
    post: authenticatedOperation('Create a company network account and routing defaults.', {
      parameters: COMPANY_PARAMETERS,
      requestBody: JSON_BODY('#/components/schemas/CreateCatalogNetworkInput'),
      responses: {
        '201': { description: 'Network account created.' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    }),
  },
  '/companies/{companyId}/catalog/networks/{accountId}/clone': {
    post: authenticatedOperation('Clone a company network account without historical data.', {
      parameters: [...COMPANY_PARAMETERS, ENTITY_ID_PARAMETER('accountId')],
      requestBody: JSON_BODY('#/components/schemas/CloneCatalogNetworkInput'),
      responses: {
        '201': { description: 'Network account cloned.' },
        '404': { $ref: '#/components/responses/NotFound' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    }),
  },
  '/companies/{companyId}/catalog/networks/{accountId}': {
    put: authenticatedOperation('Update a company network account and routing defaults.', {
      parameters: [...COMPANY_PARAMETERS, ENTITY_ID_PARAMETER('accountId')],
      requestBody: JSON_BODY('#/components/schemas/UpdateCatalogNetworkInput'),
      responses: {
        '200': { description: 'Network account updated.' },
        '404': { $ref: '#/components/responses/NotFound' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    }),
    delete: authenticatedOperation('Permanently delete an archived unused network account.', {
      parameters: [...COMPANY_PARAMETERS, ENTITY_ID_PARAMETER('accountId')],
      responses: {
        '200': { description: 'Network account permanently deleted.' },
        '404': { $ref: '#/components/responses/NotFound' },
        '409': { $ref: '#/components/responses/Conflict' },
      },
    }),
  },
  '/companies/{companyId}/catalog/publishers/{membershipId}': {
    put: authenticatedOperation(
      'Update Publisher payout, postback, timezone, and email settings.',
      {
        parameters: [...COMPANY_PARAMETERS, ENTITY_ID_PARAMETER('membershipId')],
        requestBody: JSON_BODY('#/components/schemas/UpdateCatalogPublisherInput'),
        responses: {
          '200': { description: 'Publisher settings updated.' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    ),
  },
});
