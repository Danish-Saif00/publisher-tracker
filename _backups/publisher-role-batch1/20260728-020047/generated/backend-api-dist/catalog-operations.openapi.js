const COMPANY_PARAMETERS = [
    { $ref: '#/components/parameters/CompanyId' },
    { $ref: '#/components/parameters/CompanyContext' },
];
function authenticatedOperation(summary, extra = {}) {
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
        description: 'Company-scoped Domains, Networks, Offers, Manager assignments, and Publisher operational settings.',
    },
]);
export const CATALOG_OPERATIONS_OPENAPI_SCHEMAS = Object.freeze({
    CatalogOfferConfigurationInput: {
        type: 'object',
        required: [
            'trackingDomainId',
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
                    status: { type: 'string', enum: ['draft', 'active'] },
                },
            },
        ],
    },
    UpdateCatalogOfferInput: {
        allOf: [
            { $ref: '#/components/schemas/CatalogOfferConfigurationInput' },
            {
                type: 'object',
                required: ['name', 'status'],
                properties: {
                    externalOfferId: { type: ['string', 'null'], maxLength: 255 },
                    name: { type: 'string', minLength: 2, maxLength: 160 },
                    description: { type: ['string', 'null'], maxLength: 4000 },
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
            trackingParameter: { type: ['string', 'null'], maxLength: 120 },
            postbackUrl: { type: ['string', 'null'], format: 'uri' },
            duplicateAllowed: { type: 'boolean' },
        },
    },
    UpdateCatalogNetworkInput: {
        type: 'object',
        required: ['name', 'status', 'duplicateAllowed'],
        properties: {
            name: { type: 'string', minLength: 2, maxLength: 160 },
            externalAccountId: { type: ['string', 'null'], maxLength: 255 },
            status: { type: 'string', enum: ['active', 'suspended', 'archived'] },
            trackingParameter: { type: ['string', 'null'], maxLength: 120 },
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
const JSON_BODY = (schemaReference) => Object.freeze({
    required: true,
    content: {
        'application/json': {
            schema: { $ref: schemaReference },
        },
    },
});
const ENTITY_ID_PARAMETER = (name) => Object.freeze({
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
    },
    '/companies/{companyId}/catalog/publishers/{membershipId}': {
        put: authenticatedOperation('Update Publisher payout, postback, timezone, and email settings.', {
            parameters: [...COMPANY_PARAMETERS, ENTITY_ID_PARAMETER('membershipId')],
            requestBody: JSON_BODY('#/components/schemas/UpdateCatalogPublisherInput'),
            responses: {
                '200': { description: 'Publisher settings updated.' },
                '404': { $ref: '#/components/responses/NotFound' },
            },
        }),
    },
});
//# sourceMappingURL=catalog-operations.openapi.js.map