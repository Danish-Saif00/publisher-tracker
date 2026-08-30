export const COMPANY_OPERATIONS_OPENAPI_TAGS = Object.freeze([
  {
    name: 'Reporting',
    description: 'Company click, conversion, revenue, payout, and performance reporting.',
  },
  {
    name: 'Operations',
    description: 'Company operational and audit-event visibility.',
  },
  {
    name: 'Customization',
    description: 'Company branding and support-contact customization.',
  },
  {
    name: 'Proxy',
    description:
      'Encrypted company proxy, VPN, and Tor detection configuration.',
  },
  {
    name: 'SMTP',
    description: 'Encrypted company SMTP configuration and delivery testing.',
  },
]);

export const COMPANY_OPERATIONS_OPENAPI_SCHEMAS = Object.freeze({
  ReportingMonetaryTotal: {
    type: 'object',
    required: ['currency', 'revenueAmountMinor', 'payoutAmountMinor'],
    properties: {
      currency: {
        type: 'string',
        pattern: '^[A-Z]{3}$',
      },
      revenueAmountMinor: {
        type: 'integer',
        minimum: 0,
      },
      payoutAmountMinor: {
        type: 'integer',
        minimum: 0,
      },
    },
  },
  ReportingPerformanceRow: {
    type: 'object',
    required: [
      'dimensionId',
      'dimensionName',
      'clicks',
      'conversions',
      'approvedConversions',
      'monetaryTotals',
    ],
    properties: {
      dimensionId: {
        type: 'string',
        format: 'uuid',
      },
      dimensionName: {
        type: 'string',
      },
      clicks: {
        type: 'integer',
        minimum: 0,
      },
      conversions: {
        type: 'integer',
        minimum: 0,
      },
      approvedConversions: {
        type: 'integer',
        minimum: 0,
      },
      monetaryTotals: {
        type: 'array',
        items: {
          $ref: '#/components/schemas/ReportingMonetaryTotal',
        },
      },
    },
  },
  CompanyReportingDashboard: {
    type: 'object',
    required: ['companyId', 'period', 'totals', 'offers', 'networkAccounts', 'members'],
    properties: {
      companyId: {
        type: 'string',
        format: 'uuid',
      },
      period: {
        type: 'object',
        required: ['from', 'to'],
        properties: {
          from: {
            type: 'string',
            format: 'date-time',
          },
          to: {
            type: 'string',
            format: 'date-time',
          },
        },
      },
      totals: {
        type: 'object',
        required: [
          'clicks',
          'uniqueVisitors',
          'duplicateClicks',
          'highRiskClicks',
          'conversions',
          'approvedConversions',
          'monetaryTotals',
        ],
        properties: {
          clicks: {
            type: 'integer',
            minimum: 0,
          },
          uniqueVisitors: {
            type: 'integer',
            minimum: 0,
          },
          duplicateClicks: {
            type: 'integer',
            minimum: 0,
          },
          highRiskClicks: {
            type: 'integer',
            minimum: 0,
          },
          conversions: {
            type: 'integer',
            minimum: 0,
          },
          approvedConversions: {
            type: 'integer',
            minimum: 0,
          },
          monetaryTotals: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/ReportingMonetaryTotal',
            },
          },
        },
      },
      offers: {
        type: 'array',
        items: {
          $ref: '#/components/schemas/ReportingPerformanceRow',
        },
      },
      networkAccounts: {
        type: 'array',
        items: {
          $ref: '#/components/schemas/ReportingPerformanceRow',
        },
      },
      members: {
        type: 'array',
        items: {
          $ref: '#/components/schemas/ReportingPerformanceRow',
        },
      },
    },
  },
  OperationalEvent: {
    type: 'object',
    required: [
      'id',
      'companyId',
      'actorUserId',
      'requestId',
      'eventName',
      'entityType',
      'entityId',
      'metadata',
      'createdAt',
    ],
    properties: {
      id: {
        type: 'string',
        format: 'uuid',
      },
      companyId: {
        type: ['string', 'null'],
        format: 'uuid',
      },
      actorUserId: {
        type: ['string', 'null'],
        format: 'uuid',
      },
      requestId: {
        type: ['string', 'null'],
      },
      eventName: {
        type: 'string',
      },
      entityType: {
        type: 'string',
      },
      entityId: {
        type: ['string', 'null'],
      },
      metadata: {
        type: 'object',
        additionalProperties: true,
      },
      createdAt: {
        type: 'string',
        format: 'date-time',
      },
    },
  },
  CompanyCustomization: {
    type: ['object', 'null'],
    properties: {
      id: {
        type: 'string',
        format: 'uuid',
      },
      companyId: {
        type: 'string',
        format: 'uuid',
      },
      brandName: {
        type: ['string', 'null'],
      },
      tagline: {
        type: ['string', 'null'],
        minLength: 1,
        maxLength: 240,
      },
      logoUrl: {
        type: ['string', 'null'],
        format: 'uri',
      },
      primaryColor: {
        type: ['string', 'null'],
        pattern: '^#[A-F0-9]{6}$',
      },
      secondaryColor: {
        type: ['string', 'null'],
        pattern: '^#[A-F0-9]{6}$',
      },
      supportEmail: {
        type: ['string', 'null'],
        format: 'email',
      },
      defaultCurrency: {
        type: ['string', 'null'],
        pattern: '^[A-Z]{3}$',
        example: 'USD',
      },
      defaultTimezone: {
        type: ['string', 'null'],
        minLength: 1,
        maxLength: 100,
        example: 'Asia/Karachi',
      },
      linkIdentifierMode: {
        type: 'string',
        enum: [
          'slug_or_code',
          'tracking_code',
        ],
      },
      blockedInAppBrowsers: {
        type: 'array',
        maxItems: 8,
        uniqueItems: true,
        items: {
          type: 'string',
          enum: [
            'snapchat',
            'instagram',
            'facebook',
            'messenger',
            'discord',
            'telegram',
            'tiktok',
            'other',
          ],
        },
      },
      plainTextSharingEnabled: {
        type: 'boolean',
      },
      restrictedSharePlatforms: {
        type: 'array',
        maxItems: 3,
        uniqueItems: true,
        items: {
          type: 'string',
          enum: [
            'snapchat',
            'instagram',
            'facebook',
          ],
        },
      },
      defaultLinkQueryParameters: {
        type: 'object',
        additionalProperties: {
          type: 'string',
          maxLength: 500,
        },
      },
    },
  },
  CompanyProxyConfiguration: {
    type: ['object', 'null'],
    properties: {
      id: {
        type: 'string',
        format: 'uuid',
      },
      companyId: {
        type: 'string',
        format: 'uuid',
      },
      providerCode: {
        type: 'string',
        enum: [
          'ipqualityscore',
          'proxycheck',
        ],
      },
      apiKeyLast4: {
        type: 'string',
        minLength: 4,
        maxLength: 4,
      },
      hasApiKey: {
        type: 'boolean',
      },
      status: {
        type: 'string',
        enum: [
          'active',
          'disabled',
        ],
      },
      enforcementMode: {
        type: 'string',
        enum: [
          'monitor',
          'enforce',
        ],
      },
      riskThreshold: {
        type: 'integer',
        minimum: 0,
        maximum: 100,
      },
      requestTimeoutMs: {
        type: 'integer',
        minimum: 250,
        maximum: 5000,
      },
      cacheTtlSeconds: {
        type: 'integer',
        minimum: 60,
        maximum: 86400,
      },
      failureBehavior: {
        type: 'string',
        enum: [
          'allow',
          'flag',
          'block',
        ],
      },
      detectProxy: {
        type: 'boolean',
      },
      detectVpn: {
        type: 'boolean',
      },
      detectTor: {
        type: 'boolean',
      },
      bypassOwnerMembershipIds: {
        type: 'array',
        maxItems: 500,
        uniqueItems: true,
        items: {
          type: 'string',
          format: 'uuid',
        },
      },
      apiKeyUpdatedAt: {
        type: 'string',
        format: 'date-time',
      },
      lastTestedAt: {
        type: ['string', 'null'],
        format: 'date-time',
      },
      lastTestStatus: {
        type: ['string', 'null'],
        enum: [
          'passed',
          'failed',
          null,
        ],
      },
      lastTestErrorCode: {
        type: ['string', 'null'],
      },
      createdBy: {
        type: ['string', 'null'],
        format: 'uuid',
      },
      updatedBy: {
        type: ['string', 'null'],
        format: 'uuid',
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
  CompanyProxyConfigurationInput: {
    type: 'object',
    required: [
      'providerCode',
      'status',
      'enforcementMode',
      'riskThreshold',
      'requestTimeoutMs',
      'cacheTtlSeconds',
      'failureBehavior',
      'detectProxy',
      'detectVpn',
      'detectTor',
      'bypassOwnerMembershipIds',
    ],
    properties: {
      providerCode: {
        type: 'string',
        enum: [
          'ipqualityscore',
          'proxycheck',
        ],
      },
      apiKey: {
        type: 'string',
        minLength: 4,
        maxLength: 4096,
        writeOnly: true,
        description:
          'Required when creating the configuration or changing the provider. Never returned by the API.',
      },
      status: {
        type: 'string',
        enum: [
          'active',
          'disabled',
        ],
      },
      enforcementMode: {
        type: 'string',
        enum: [
          'monitor',
          'enforce',
        ],
      },
      riskThreshold: {
        type: 'integer',
        minimum: 0,
        maximum: 100,
      },
      requestTimeoutMs: {
        type: 'integer',
        minimum: 250,
        maximum: 5000,
      },
      cacheTtlSeconds: {
        type: 'integer',
        minimum: 60,
        maximum: 86400,
      },
      failureBehavior: {
        type: 'string',
        enum: [
          'allow',
          'flag',
          'block',
        ],
      },
      detectProxy: {
        type: 'boolean',
      },
      detectVpn: {
        type: 'boolean',
      },
      detectTor: {
        type: 'boolean',
      },
      bypassOwnerMembershipIds: {
        type: 'array',
        maxItems: 500,
        uniqueItems: true,
        items: {
          type: 'string',
          format: 'uuid',
        },
      },
    },
  },
  CompanySmtpConfiguration: {
    type: ['object', 'null'],
    properties: {
      id: {
        type: 'string',
        format: 'uuid',
      },
      companyId: {
        type: 'string',
        format: 'uuid',
      },
      host: {
        type: 'string',
      },
      port: {
        type: 'integer',
        minimum: 1,
        maximum: 65535,
      },
      secureMode: {
        type: 'string',
        enum: ['plain', 'starttls', 'tls'],
      },
      username: {
        type: 'string',
      },
      senderEmail: {
        type: 'string',
        format: 'email',
      },
      senderName: {
        type: 'string',
      },
      replyToEmail: {
        type: ['string', 'null'],
        format: 'email',
      },
      status: {
        type: 'string',
        enum: ['active', 'disabled'],
      },
      hasPassword: {
        type: 'boolean',
      },
      passwordUpdatedAt: {
        type: 'string',
        format: 'date-time',
      },
      lastTestedAt: {
        type: ['string', 'null'],
        format: 'date-time',
      },
      lastTestStatus: {
        type: ['string', 'null'],
        enum: ['pending', 'sent', 'failed', null],
      },
    },
  },
  SmtpTestResult: {
    type: 'object',
    required: ['eventId', 'status', 'recipientEmail', 'completedAt'],
    properties: {
      eventId: {
        type: 'string',
        format: 'uuid',
      },
      status: {
        type: 'string',
        enum: ['sent'],
      },
      recipientEmail: {
        type: 'string',
        format: 'email',
      },
      completedAt: {
        type: 'string',
        format: 'date-time',
      },
    },
  },
});

const companyIdParameter = {
  name: 'companyId',
  in: 'path',
  required: true,
  schema: {
    type: 'string',
    format: 'uuid',
  },
};

const companySecurity = [
  {
    bearerAuth: [],
  },
];

export const COMPANY_OPERATIONS_OPENAPI_PATHS = Object.freeze({
  '/companies/{companyId}/reporting/dashboard': {
    get: {
      tags: ['Reporting'],
      summary: 'Get company reporting dashboard.',
      security: companySecurity,
      parameters: [
        companyIdParameter,
        {
          name: 'from',
          in: 'query',
          schema: {
            type: 'string',
            format: 'date-time',
          },
        },
        {
          name: 'to',
          in: 'query',
          schema: {
            type: 'string',
            format: 'date-time',
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
          name: 'networkAccountId',
          in: 'query',
          schema: {
            type: 'string',
            format: 'uuid',
          },
        },
        {
          name: 'ownerMembershipId',
          in: 'query',
          schema: {
            type: 'string',
            format: 'uuid',
          },
        },
      ],
      responses: {
        200: {
          description: 'Company reporting dashboard.',
        },
      },
    },
  },
  '/companies/{companyId}/operations/events': {
    get: {
      tags: ['Operations'],
      summary: 'List company operational audit events.',
      security: companySecurity,
      parameters: [
        companyIdParameter,
        {
          name: 'eventName',
          in: 'query',
          schema: {
            type: 'string',
          },
        },
        {
          name: 'entityType',
          in: 'query',
          schema: {
            type: 'string',
          },
        },
        {
          name: 'limit',
          in: 'query',
          schema: {
            type: 'integer',
            minimum: 1,
            maximum: 200,
          },
        },
      ],
      responses: {
        200: {
          description: 'Operational events.',
        },
      },
    },
  },
  '/companies/{companyId}/customization': {
    get: {
      tags: ['Customization'],
      summary: 'Get company customization.',
      security: companySecurity,
      parameters: [companyIdParameter],
      responses: {
        200: {
          description: 'Company customization.',
        },
      },
    },
    put: {
      tags: ['Customization'],
      summary: 'Create or update company customization.',
      security: companySecurity,
      parameters: [companyIdParameter],
      responses: {
        200: {
          description: 'Updated company customization.',
        },
      },
    },
  },
  '/companies/{companyId}/proxy': {
    get: {
      tags: ['Proxy'],
      summary:
        'Get the redacted company proxy detection configuration.',
      security: companySecurity,
      parameters: [
        companyIdParameter,
      ],
      responses: {
        200: {
          description:
            'Redacted proxy detection configuration.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'object',
                    properties: {
                      proxyConfiguration: {
                        $ref:
                          '#/components/schemas/CompanyProxyConfiguration',
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
    put: {
      tags: ['Proxy'],
      summary:
        'Create or update encrypted company proxy detection configuration.',
      security: companySecurity,
      parameters: [
        companyIdParameter,
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              $ref:
                '#/components/schemas/CompanyProxyConfigurationInput',
            },
          },
        },
      },
      responses: {
        200: {
          description:
            'Updated redacted proxy detection configuration.',
        },
        400: {
          description:
            'The proxy configuration is invalid.',
        },
      },
    },
  },
  '/companies/{companyId}/smtp': {
    get: {
      tags: ['SMTP'],
      summary: 'Get redacted company SMTP configuration.',
      security: companySecurity,
      parameters: [companyIdParameter],
      responses: {
        200: {
          description: 'Redacted SMTP configuration.',
        },
      },
    },
    put: {
      tags: ['SMTP'],
      summary: 'Create or update encrypted company SMTP configuration.',
      security: companySecurity,
      parameters: [companyIdParameter],
      responses: {
        200: {
          description: 'Updated redacted SMTP configuration.',
        },
      },
    },
  },
  '/companies/{companyId}/smtp/test': {
    post: {
      tags: ['SMTP'],
      summary: 'Send a company SMTP test email.',
      security: companySecurity,
      parameters: [companyIdParameter],
      responses: {
        200: {
          description: 'SMTP test email sent.',
        },
        502: {
          description: 'SMTP test delivery failed.',
        },
      },
    },
  },
});
