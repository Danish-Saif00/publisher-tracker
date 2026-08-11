export const MANAGED_USERS_OPENAPI_TAGS = Object.freeze([
  {
    name: 'Managed Users',
    description:
      'Administrator-controlled user provisioning and credential resets within the fixed role hierarchy.',
  },
]);

export const MANAGED_USERS_OPENAPI_SCHEMAS = Object.freeze({
  ManagedUserCreateInput: {
    type: 'object',
    additionalProperties: false,
    required: ['email', 'password'],
    properties: {
      email: {
        type: 'string',
        format: 'email',
        maxLength: 320,
      },
      password: {
        type: 'string',
        format: 'password',
        minLength: 6,
        maxLength: 16,
        writeOnly: true,
      },
    },
  },
  ManagedUserUpdateInput: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      email: {
        type: 'string',
        format: 'email',
        maxLength: 320,
      },
      displayName: {
        type: 'string',
        maxLength: 160,
      },
      password: {
        type: 'string',
        format: 'password',
        minLength: 6,
        maxLength: 16,
        writeOnly: true,
      },
    },
  },
  ManagedUserUpdateResult: {
    type: 'object',
    additionalProperties: false,
    required: ['user', 'passwordUpdated'],
    properties: {
      user: {
        type: 'object',
      },
      passwordUpdated: {
        type: 'boolean',
      },
    },
  },
  ManagedUserPasswordResetInput: {
    type: 'object',
    additionalProperties: false,
    required: ['password'],
    properties: {
      password: {
        type: 'string',
        format: 'password',
        minLength: 6,
        maxLength: 16,
        writeOnly: true,
      },
    },
  },
  ManagedUserPasswordResetResult: {
    type: 'object',
    additionalProperties: false,
    required: ['userId', 'passwordUpdated'],
    properties: {
      userId: {
        type: 'string',
        format: 'uuid',
      },
      passwordUpdated: {
        type: 'boolean',
        const: true,
      },
    },
  },
});

export const MANAGED_USERS_OPENAPI_PATHS = Object.freeze({
  '/companies/{companyId}/managed-users': {
    post: {
      tags: ['Managed Users'],
      summary: 'Create the next managed role with an administrator-set password.',
      description:
        'The target role is derived from the authenticated actor: Platform Super Admin creates Company Admin, Company Admin creates Manager, and Manager creates Publisher.',
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
              $ref: '#/components/schemas/ManagedUserCreateInput',
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Managed user created with an immediately active membership.',
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
  '/companies/{companyId}/managed-users/{userId}': {
    patch: {
      tags: ['Managed Users'],
      summary: 'Edit a managed child user identity and optional password.',
      description:
        'Company Admin can edit Managers and Manager can edit Publishers they created. Deleted memberships are terminal and cannot be edited.',
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
          name: 'userId',
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
              $ref: '#/components/schemas/ManagedUserUpdateInput',
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Managed user updated.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['data'],
                properties: {
                  data: {
                    $ref: '#/components/schemas/ManagedUserUpdateResult',
                  },
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
        '404': {
          $ref: '#/components/responses/NotFound',
        },
        '409': {
          $ref: '#/components/responses/Conflict',
        },
      },
    },
  },
  '/companies/{companyId}/managed-users/{userId}/password': {
    patch: {
      tags: ['Managed Users'],
      summary: 'Reset a managed child user password.',
      description:
        'The password is write-only and never returned, logged, persisted in application tables, or included in audit metadata.',
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
          name: 'userId',
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
              $ref: '#/components/schemas/ManagedUserPasswordResetInput',
            },
          },
        },
      },
      responses: {
        '200': {
          description: 'Managed password reset completed.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['data'],
                properties: {
                  data: {
                    $ref: '#/components/schemas/ManagedUserPasswordResetResult',
                  },
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
        '404': {
          $ref: '#/components/responses/NotFound',
        },
        '409': {
          $ref: '#/components/responses/Conflict',
        },
      },
    },
  },
});
