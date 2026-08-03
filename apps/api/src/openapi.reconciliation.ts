type HttpMethod = 'delete' | 'get' | 'patch' | 'post' | 'put';

interface OperationDefinition {
  readonly method: HttpMethod;
  readonly path: string;
  readonly tag: string;
  readonly summary: string;
  readonly public: boolean;
  readonly hasRequestBody: boolean;
  readonly successStatus: string;
  readonly rootServer: boolean;
}

const OPERATION_DEFINITIONS: readonly OperationDefinition[] = Object.freeze([
  {
    method: 'get',
    path: '/health',
    tag: 'Health',
    summary: 'Read API liveness status.',
    public: true,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: true,
  },
  {
    method: 'get',
    path: '/ready',
    tag: 'Health',
    summary: 'Read API dependency readiness status.',
    public: true,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: true,
  },
  {
    method: 'get',
    path: '/r/{token}',
    tag: 'Public Tracking',
    summary: 'Resolve a public tracking token and redirect to its destination.',
    public: true,
    hasRequestBody: false,
    successStatus: '302',
    rootServer: true,
  },
  {
    method: 'get',
    path: '/pub_id={publisherId}',
    tag: 'Public Tracking',
    summary: 'Resolve a Publisher and Offer reference tracking link and redirect.',
    public: true,
    hasRequestBody: false,
    successStatus: '302',
    rootServer: true,
  },
  {
    method: 'post',
    path: '/platform/billing/plans',
    tag: 'Billing',
    summary: 'Create a platform billing plan.',
    public: false,
    hasRequestBody: true,
    successStatus: '201',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/platform/billing/plans',
    tag: 'Billing',
    summary: 'List platform billing plans.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/platform/billing/plans/{planId}',
    tag: 'Billing',
    summary: 'Read a platform billing plan.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'patch',
    path: '/platform/billing/plans/{planId}',
    tag: 'Billing',
    summary: 'Update a platform billing plan.',
    public: false,
    hasRequestBody: true,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'post',
    path: '/platform/companies/{companyId}/subscription',
    tag: 'Billing',
    summary: 'Create a company subscription.',
    public: false,
    hasRequestBody: true,
    successStatus: '201',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/platform/companies/{companyId}/subscription',
    tag: 'Billing',
    summary: 'Read a company subscription.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'patch',
    path: '/platform/companies/{companyId}/subscription',
    tag: 'Billing',
    summary: 'Update a company subscription.',
    public: false,
    hasRequestBody: true,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/billing/subscription',
    tag: 'Billing',
    summary: 'Read the current company billing subscription.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'post',
    path: '/platform/companies',
    tag: 'Companies',
    summary: 'Create a company.',
    public: false,
    hasRequestBody: true,
    successStatus: '201',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/platform/companies',
    tag: 'Companies',
    summary: 'List companies.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/me/companies',
    tag: 'Companies',
    summary: 'List companies available to the authenticated user.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}',
    tag: 'Companies',
    summary: 'Read a company.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/memberships',
    tag: 'Company Memberships',
    summary: 'List company memberships.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'patch',
    path: '/companies/{companyId}/memberships/{membershipId}',
    tag: 'Company Memberships',
    summary: 'Update a company membership.',
    public: false,
    hasRequestBody: true,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'post',
    path: '/companies/{companyId}/network-accounts/{networkAccountId}/postback-endpoints',
    tag: 'Postback Endpoints',
    summary: 'Create a postback endpoint and return one-time Provider setup.',
    public: false,
    hasRequestBody: true,
    successStatus: '201',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/network-accounts/{networkAccountId}/postback-endpoints',
    tag: 'Postback Endpoints',
    summary: 'List postback endpoints.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'patch',
    path: '/companies/{companyId}/network-accounts/{networkAccountId}/postback-endpoints/{endpointId}',
    tag: 'Postback Endpoints',
    summary: 'Update a postback endpoint.',
    public: false,
    hasRequestBody: true,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'post',
    path: '/companies/{companyId}/network-accounts/{networkAccountId}/postback-endpoints/{endpointId}/rotate-key',
    tag: 'Postback Endpoints',
    summary: 'Rotate a postback endpoint key and return refreshed Provider setup.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/conversions',
    tag: 'Conversions',
    summary: 'List conversions.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/conversions/{conversionId}',
    tag: 'Conversions',
    summary: 'Read a conversion.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'post',
    path: '/companies/{companyId}/duplicate-protection-rules',
    tag: 'Duplicate Protection',
    summary: 'Create a duplicate-protection rule.',
    public: false,
    hasRequestBody: true,
    successStatus: '201',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/duplicate-protection-rules',
    tag: 'Duplicate Protection',
    summary: 'List duplicate-protection rules.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/duplicate-protection-rules/{ruleId}',
    tag: 'Duplicate Protection',
    summary: 'Read a duplicate-protection rule.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'patch',
    path: '/companies/{companyId}/duplicate-protection-rules/{ruleId}',
    tag: 'Duplicate Protection',
    summary: 'Update a duplicate-protection rule.',
    public: false,
    hasRequestBody: true,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/fraud-clicks',
    tag: 'Fraud Review',
    summary: 'List click duplicate decisions and fraud signals.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'post',
    path: '/companies/{companyId}/offers',
    tag: 'Offers',
    summary: 'Create an offer.',
    public: false,
    hasRequestBody: true,
    successStatus: '201',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/offers',
    tag: 'Offers',
    summary: 'List offers.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/offers/{offerId}',
    tag: 'Offers',
    summary: 'Read an offer.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'patch',
    path: '/companies/{companyId}/offers/{offerId}',
    tag: 'Offers',
    summary: 'Update an offer.',
    public: false,
    hasRequestBody: true,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'put',
    path: '/companies/{companyId}/payout-profiles/{membershipId}',
    tag: 'Payouts',
    summary: 'Create or replace a member payout profile.',
    public: false,
    hasRequestBody: true,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/payout-profiles',
    tag: 'Payouts',
    summary: 'List member payout profiles.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/payout-profile',
    tag: 'Payouts',
    summary: 'Read the current member payout profile.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'post',
    path: '/companies/{companyId}/offers/{offerId}/assignments',
    tag: 'Offer Assignments',
    summary: 'Create an offer assignment.',
    public: false,
    hasRequestBody: true,
    successStatus: '201',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/offers/{offerId}/assignments',
    tag: 'Offer Assignments',
    summary: 'List offer assignments.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'patch',
    path: '/companies/{companyId}/offers/{offerId}/assignments/{assignmentId}',
    tag: 'Offer Assignments',
    summary: 'Update an offer assignment.',
    public: false,
    hasRequestBody: true,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/reporting/dashboard',
    tag: 'Reporting',
    summary: 'Read the company reporting dashboard.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/operations/events',
    tag: 'Operations',
    summary: 'List company operational events.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/customization',
    tag: 'Customization',
    summary: 'Read company customization.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'put',
    path: '/companies/{companyId}/customization',
    tag: 'Customization',
    summary: 'Create or replace company customization.',
    public: false,
    hasRequestBody: true,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/proxy',
    tag: 'Proxy',
    summary: 'Read the redacted company proxy detection configuration.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'put',
    path: '/companies/{companyId}/proxy',
    tag: 'Proxy',
    summary: 'Create or replace the encrypted company proxy detection configuration.',
    public: false,
    hasRequestBody: true,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/smtp',
    tag: 'SMTP',
    summary: 'Read company SMTP configuration.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'put',
    path: '/companies/{companyId}/smtp',
    tag: 'SMTP',
    summary: 'Create or replace company SMTP configuration.',
    public: false,
    hasRequestBody: true,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'post',
    path: '/companies/{companyId}/smtp/test',
    tag: 'SMTP',
    summary: 'Send a company SMTP test email.',
    public: false,
    hasRequestBody: true,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'patch',
    path: '/platform/companies/{companyId}/status',
    tag: 'Tenant Administration',
    summary: 'Update company status.',
    public: false,
    hasRequestBody: true,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'patch',
    path: '/platform/users/{userId}/status',
    tag: 'Tenant Administration',
    summary: 'Update user status.',
    public: false,
    hasRequestBody: true,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/users',
    tag: 'Tenant Administration',
    summary: 'List company users.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/users/{userId}',
    tag: 'Tenant Administration',
    summary: 'Read a company user.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/audit-events',
    tag: 'Tenant Administration',
    summary: 'List company audit events.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'post',
    path: '/companies/{companyId}/tracking-links',
    tag: 'Tracking Links',
    summary: 'Create a manual tracking link.',
    public: false,
    hasRequestBody: true,
    successStatus: '201',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/tracking-links',
    tag: 'Tracking Links',
    summary: 'List manual and assignment-generated tracking links.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/tracking-links/{linkId}',
    tag: 'Tracking Links',
    summary: 'Read a manual or assignment-generated tracking link.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'patch',
    path: '/companies/{companyId}/tracking-links/{linkId}',
    tag: 'Tracking Links',
    summary: 'Update a tenant-owned tracking link without changing its source.',
    public: false,
    hasRequestBody: true,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'post',
    path: '/companies/{companyId}/tracking-links/{linkId}/clone',
    tag: 'Tracking Links',
    summary: 'Clone a tracking link into a fresh manual draft link.',
    public: false,
    hasRequestBody: false,
    successStatus: '201',
    rootServer: false,
  },
  {
    method: 'post',
    path: '/companies/{companyId}/tracking-links/{linkId}/archive',
    tag: 'Tracking Links',
    summary: 'Archive a tracking link without changing its configuration.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'delete',
    path: '/companies/{companyId}/tracking-links/{linkId}',
    tag: 'Tracking Links',
    summary: 'Permanently delete an archived unused manual tracking link.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'post',
    path: '/companies/{companyId}/tracking-domains',
    tag: 'Tracking Domains',
    summary: 'Create a tracking domain.',
    public: false,
    hasRequestBody: true,
    successStatus: '201',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/tracking-domains',
    tag: 'Tracking Domains',
    summary: 'List tracking domains.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/tracking-domains/{domainId}',
    tag: 'Tracking Domains',
    summary: 'Read a tracking domain.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'patch',
    path: '/companies/{companyId}/tracking-domains/{domainId}',
    tag: 'Tracking Domains',
    summary: 'Update a tracking domain.',
    public: false,
    hasRequestBody: true,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/platform/tracking-domains',
    tag: 'Tracking Domains',
    summary: 'List tracking domains.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'patch',
    path: '/platform/tracking-domains/{domainId}/status',
    tag: 'Tracking Domains',
    summary: 'Update tracking-domain verification status.',
    public: false,
    hasRequestBody: true,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'post',
    path: '/platform/tracking-domains/{domainId}/adopt',
    tag: 'Tracking Domains',
    summary: 'Adopt a legacy domain into dashboard-managed provider provisioning.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'post',
    path: '/platform/tracking-domains/{domainId}/reconcile',
    tag: 'Tracking Domains',
    summary: 'Verify ownership and reconcile provider, DNS, and TLS readiness.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'post',
    path: '/platform/tracking-domains/{domainId}/disconnect',
    tag: 'Tracking Domains',
    summary: 'Disconnect an unused managed domain from its infrastructure provider.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'post',
    path: '/companies/{companyId}/network-providers',
    tag: 'Network Providers',
    summary: 'Create a company Network Provider and integration profile.',
    public: false,
    hasRequestBody: true,
    successStatus: '201',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/network-providers',
    tag: 'Network Providers',
    summary: 'List company Network Providers with integration readiness.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/network-providers/{providerId}',
    tag: 'Network Providers',
    summary: 'Read a company Network Provider and integration profile.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'patch',
    path: '/companies/{companyId}/network-providers/{providerId}',
    tag: 'Network Providers',
    summary: 'Update a company Network Provider and integration profile.',
    public: false,
    hasRequestBody: true,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'post',
    path: '/companies/{companyId}/network-accounts',
    tag: 'Network Accounts',
    summary: 'Create a network account.',
    public: false,
    hasRequestBody: true,
    successStatus: '201',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/network-accounts',
    tag: 'Network Accounts',
    summary: 'List network accounts.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'get',
    path: '/companies/{companyId}/network-accounts/{accountId}',
    tag: 'Network Accounts',
    summary: 'Read a network account.',
    public: false,
    hasRequestBody: false,
    successStatus: '200',
    rootServer: false,
  },
  {
    method: 'patch',
    path: '/companies/{companyId}/network-accounts/{accountId}',
    tag: 'Network Accounts',
    summary: 'Update a network account.',
    public: false,
    hasRequestBody: true,
    successStatus: '200',
    rootServer: false,
  },
]);

const TAG_NAMES = Object.freeze([
  'Health',
  'Public Tracking',
  'Companies',
  'Company Memberships',
  'Billing',
  'Tenant Administration',
  'Tracking Domains',
  'Network Providers',
  'Network Accounts',
  'Offers',
  'Payouts',
  'Offer Assignments',
  'Tracking Links',
  'Duplicate Protection',
  'Fraud Review',
  'Postback Endpoints',
  'Conversions',
  'Reporting',
  'Operations',
  'Customization',
  'Proxy',
  'SMTP',
]);

function createPathParameters(path: string): readonly Readonly<Record<string, unknown>>[] {
  const matches = [...path.matchAll(/\{([A-Za-z0-9_]+)\}/gu)];

  return Object.freeze(
    matches.map((match): Readonly<Record<string, unknown>> => {
      const parameterName = match[1];

      if (parameterName === undefined) {
        throw new Error('OpenAPI path parameter name is unavailable.');
      }

      if (parameterName === 'companyId') {
        return Object.freeze({
          $ref: '#/components/parameters/CompanyId',
        });
      }

      return Object.freeze({
        name: parameterName,
        in: 'path',
        required: true,
        schema: Object.freeze({
          type: 'string',
          ...(parameterName === 'endpointKey' || parameterName === 'token'
            ? {}
            : {
                format: 'uuid',
              }),
        }),
      });
    }),
  );
}

function createOperationParameters(
  definition: OperationDefinition,
): readonly Readonly<Record<string, unknown>>[] {
  const parameters = [...createPathParameters(definition.path)];

  if (definition.path.includes('{companyId}')) {
    parameters.push(
      Object.freeze({
        $ref: '#/components/parameters/CompanyContext',
      }),
    );
  }

  return Object.freeze(parameters);
}

function createOperationResponses(
  definition: OperationDefinition,
): Readonly<Record<string, unknown>> {
  const responses: Record<string, unknown> = {
    [definition.successStatus]: Object.freeze({
      description:
        definition.successStatus === '201'
          ? 'The resource was created successfully.'
          : definition.successStatus === '302'
            ? 'The tracking request was redirected.'
            : 'The request completed successfully.',
    }),
  };

  if (!definition.public) {
    responses['400'] = Object.freeze({
      $ref: '#/components/responses/BadRequest',
    });
    responses['401'] = Object.freeze({
      $ref: '#/components/responses/Unauthorized',
    });
    responses['403'] = Object.freeze({
      $ref: '#/components/responses/Forbidden',
    });
    responses['404'] = Object.freeze({
      $ref: '#/components/responses/NotFound',
    });
    responses['409'] = Object.freeze({
      $ref: '#/components/responses/Conflict',
    });
  }

  responses['429'] = Object.freeze({
    description: 'The configured request rate limit was exceeded.',
    content: Object.freeze({
      'application/json': Object.freeze({
        schema: Object.freeze({
          $ref: '#/components/schemas/ApiError',
        }),
      }),
    }),
  });

  return Object.freeze(responses);
}

function createOperation(definition: OperationDefinition): Readonly<Record<string, unknown>> {
  const parameters = createOperationParameters(definition);

  return Object.freeze({
    tags: Object.freeze([definition.tag]),
    summary: definition.summary,
    ...(definition.public
      ? {}
      : {
          security: Object.freeze([
            Object.freeze({
              bearerAuth: Object.freeze([]),
            }),
          ]),
        }),
    ...(parameters.length > 0
      ? {
          parameters,
        }
      : {}),
    ...(definition.hasRequestBody
      ? {
          requestBody: Object.freeze({
            required: true,
            content: Object.freeze({
              'application/json': Object.freeze({
                schema: Object.freeze({
                  type: 'object',
                  additionalProperties: true,
                }),
              }),
            }),
          }),
        }
      : {}),
    ...(definition.rootServer
      ? {
          servers: Object.freeze([
            Object.freeze({
              url: '/',
            }),
          ]),
        }
      : {}),
    responses: createOperationResponses(definition),
  });
}

function createPaths(): Readonly<Record<string, unknown>> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const definition of OPERATION_DEFINITIONS) {
    const existingPath = paths[definition.path] ?? {};

    existingPath[definition.method] = createOperation(definition);
    paths[definition.path] = existingPath;
  }

  return Object.freeze(
    Object.fromEntries(
      Object.entries(paths).map(([path, operations]) => [path, Object.freeze(operations)]),
    ),
  );
}

export const OPENAPI_RECONCILIATION_TAGS = Object.freeze(
  TAG_NAMES.map((name) =>
    Object.freeze({
      name,
    }),
  ),
);

export const OPENAPI_RECONCILIATION_SCHEMAS = Object.freeze({
  HealthStatus: Object.freeze({
    type: 'object',
    required: Object.freeze(['status', 'service', 'requestId', 'timestamp']),
    properties: Object.freeze({
      status: Object.freeze({
        type: 'string',
        enum: Object.freeze(['ok', 'ready', 'not_ready']),
      }),
      service: Object.freeze({
        type: 'string',
      }),
      requestId: Object.freeze({
        type: 'string',
      }),
      timestamp: Object.freeze({
        type: 'string',
        format: 'date-time',
      }),
    }),
  }),
});

export const OPENAPI_RECONCILIATION_PATHS = createPaths();

export const OPENAPI_RECONCILIATION_OPERATIONS = OPERATION_DEFINITIONS;
