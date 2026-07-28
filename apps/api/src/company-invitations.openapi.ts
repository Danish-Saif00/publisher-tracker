const bearerSecurity = Object.freeze([
  Object.freeze({
    bearerAuth: Object.freeze([]),
  }),
]);

const companyIdParameter = Object.freeze({
  $ref: '#/components/parameters/CompanyId',
});

const companyContextParameter = Object.freeze({
  $ref: '#/components/parameters/CompanyContext',
});

const invitationIdParameter = Object.freeze({
  name: 'invitationId',
  in: 'path',
  required: true,
  schema: Object.freeze({
    type: 'string',
    format: 'uuid',
  }),
});

export const COMPANY_INVITATIONS_OPENAPI_TAGS = Object.freeze([
  Object.freeze({
    name: 'Company Invitations',
    description: 'Email-based company invitation delivery, lifecycle management, and acceptance.',
  }),
]);

export const COMPANY_INVITATIONS_OPENAPI_SCHEMAS = Object.freeze({
  CompanyInvitation: Object.freeze({
    type: 'object',
    required: Object.freeze([
      'id',
      'companyId',
      'email',
      'role',
      'status',
      'deliveryStatus',
      'requiresPasswordSetup',
      'expiresAt',
      'sendCount',
      'createdAt',
      'updatedAt',
    ]),
    properties: Object.freeze({
      id: Object.freeze({ type: 'string', format: 'uuid' }),
      companyId: Object.freeze({ type: 'string', format: 'uuid' }),
      email: Object.freeze({ type: 'string', format: 'email' }),
      role: Object.freeze({
        type: 'string',
        enum: Object.freeze(['company_admin', 'manager', 'publisher']),
      }),
      status: Object.freeze({
        type: 'string',
        enum: Object.freeze(['pending', 'accepted', 'revoked']),
      }),
      deliveryStatus: Object.freeze({
        type: 'string',
        enum: Object.freeze(['pending', 'sent', 'failed']),
      }),
      userId: Object.freeze({ type: ['string', 'null'], format: 'uuid' }),
      requiresPasswordSetup: Object.freeze({ type: 'boolean' }),
      invitedBy: Object.freeze({ type: ['string', 'null'], format: 'uuid' }),
      expiresAt: Object.freeze({ type: 'string', format: 'date-time' }),
      acceptedAt: Object.freeze({ type: ['string', 'null'], format: 'date-time' }),
      revokedAt: Object.freeze({ type: ['string', 'null'], format: 'date-time' }),
      lastSentAt: Object.freeze({ type: ['string', 'null'], format: 'date-time' }),
      sendCount: Object.freeze({ type: 'integer', minimum: 0 }),
      lastDeliveryErrorCode: Object.freeze({ type: ['string', 'null'] }),
      createdAt: Object.freeze({ type: 'string', format: 'date-time' }),
      updatedAt: Object.freeze({ type: 'string', format: 'date-time' }),
    }),
  }),
  CompanyInvitationPreview: Object.freeze({
    type: 'object',
    required: Object.freeze([
      'invitationId',
      'company',
      'email',
      'role',
      'expiresAt',
      'requiresPasswordSetup',
    ]),
    properties: Object.freeze({
      invitationId: Object.freeze({ type: 'string', format: 'uuid' }),
      company: Object.freeze({ type: 'object' }),
      email: Object.freeze({ type: 'string', format: 'email' }),
      role: Object.freeze({
        type: 'string',
        enum: Object.freeze(['company_admin', 'manager', 'publisher']),
      }),
      expiresAt: Object.freeze({ type: 'string', format: 'date-time' }),
      requiresPasswordSetup: Object.freeze({ type: 'boolean' }),
    }),
  }),
});

export const COMPANY_INVITATIONS_OPENAPI_PATHS = Object.freeze({
  '/companies/{companyId}/invitations': Object.freeze({
    get: Object.freeze({
      tags: Object.freeze(['Company Invitations']),
      summary: 'List company invitations.',
      security: bearerSecurity,
      parameters: Object.freeze([companyIdParameter, companyContextParameter]),
      responses: Object.freeze({
        200: Object.freeze({ description: 'Company invitation collection.' }),
      }),
    }),
    post: Object.freeze({
      tags: Object.freeze(['Company Invitations']),
      summary: 'Create and deliver an email invitation.',
      security: bearerSecurity,
      parameters: Object.freeze([companyIdParameter, companyContextParameter]),
      requestBody: Object.freeze({
        required: true,
        content: Object.freeze({
          'application/json': Object.freeze({
            schema: Object.freeze({
              type: 'object',
              required: Object.freeze(['email', 'role']),
              properties: Object.freeze({
                email: Object.freeze({ type: 'string', format: 'email' }),
                role: Object.freeze({
                  type: 'string',
                  enum: Object.freeze(['company_admin', 'manager', 'publisher']),
                }),
              }),
            }),
          }),
        }),
      }),
      responses: Object.freeze({
        201: Object.freeze({ description: 'Invitation created and delivered.' }),
        409: Object.freeze({ description: 'Invitation or membership conflict.' }),
        502: Object.freeze({ description: 'Invitation saved but email delivery failed.' }),
      }),
    }),
  }),
  '/companies/{companyId}/invitations/{invitationId}/resend': Object.freeze({
    post: Object.freeze({
      tags: Object.freeze(['Company Invitations']),
      summary: 'Rotate and resend a pending invitation.',
      security: bearerSecurity,
      parameters: Object.freeze([
        companyIdParameter,
        companyContextParameter,
        invitationIdParameter,
      ]),
      responses: Object.freeze({
        200: Object.freeze({ description: 'Invitation resent.' }),
      }),
    }),
  }),
  '/companies/{companyId}/invitations/{invitationId}/revoke': Object.freeze({
    post: Object.freeze({
      tags: Object.freeze(['Company Invitations']),
      summary: 'Revoke a pending invitation.',
      security: bearerSecurity,
      parameters: Object.freeze([
        companyIdParameter,
        companyContextParameter,
        invitationIdParameter,
      ]),
      responses: Object.freeze({
        200: Object.freeze({ description: 'Invitation revoked.' }),
      }),
    }),
  }),
  '/invitations/preview': Object.freeze({
    post: Object.freeze({
      tags: Object.freeze(['Company Invitations']),
      summary: 'Preview an invitation for its authenticated recipient.',
      security: bearerSecurity,
      responses: Object.freeze({
        200: Object.freeze({ description: 'Invitation preview.' }),
        403: Object.freeze({ description: 'Invitation belongs to another account.' }),
        410: Object.freeze({ description: 'Invitation expired or revoked.' }),
      }),
    }),
  }),
  '/invitations/accept': Object.freeze({
    post: Object.freeze({
      tags: Object.freeze(['Company Invitations']),
      summary: 'Accept an invitation and activate company membership.',
      security: bearerSecurity,
      responses: Object.freeze({
        200: Object.freeze({ description: 'Invitation accepted.' }),
        409: Object.freeze({ description: 'Invitation acceptance conflict.' }),
      }),
    }),
  }),
});
