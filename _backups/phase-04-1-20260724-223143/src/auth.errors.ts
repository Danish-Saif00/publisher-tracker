export type AuthenticationErrorCode =
  | 'AUTHORIZATION_HEADER_MISSING'
  | 'AUTHORIZATION_HEADER_INVALID'
  | 'ACCESS_TOKEN_INVALID'
  | 'ACCESS_TOKEN_CLAIMS_INVALID'
  | 'ACCESS_TOKEN_ISSUER_INVALID'
  | 'ACCESS_TOKEN_AUDIENCE_INVALID'
  | 'ACCESS_TOKEN_ROLE_INVALID';

export type AuthorizationErrorCode =
  | 'ACCOUNT_ACCESS_DENIED'
  | 'PLATFORM_ROLE_REQUIRED'
  | 'COMPANY_ACCESS_DENIED'
  | 'COMPANY_ROLE_REQUIRED';

export interface AuthenticationErrorOptions {
  readonly cause?: unknown;
}

export interface AuthorizationErrorOptions {
  readonly cause?: unknown;
}

function createNativeErrorOptions(cause: unknown): ErrorOptions | undefined {
  return cause === undefined
    ? undefined
    : {
        cause,
      };
}

function normalizeMessage(message: string, fallbackMessage: string): string {
  const normalizedMessage = message.trim();

  return normalizedMessage.length > 0 ? normalizedMessage : fallbackMessage;
}

export class AuthenticationConfigurationError extends Error {
  public readonly code = 'AUTH_CONFIGURATION_INVALID';

  public constructor(message: string, options: AuthenticationErrorOptions = {}) {
    super(
      normalizeMessage(message, 'Authentication configuration is invalid.'),
      createNativeErrorOptions(options.cause),
    );

    this.name = 'AuthenticationConfigurationError';
  }
}

export class AuthenticationError extends Error {
  public readonly statusCode = 401;

  public constructor(
    public readonly code: AuthenticationErrorCode,
    message: string,
    options: AuthenticationErrorOptions = {},
  ) {
    super(
      normalizeMessage(message, 'Authentication failed.'),
      createNativeErrorOptions(options.cause),
    );

    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  public readonly statusCode = 403;

  public constructor(
    public readonly code: AuthorizationErrorCode,
    message: string,
    options: AuthorizationErrorOptions = {},
  ) {
    super(
      normalizeMessage(message, 'Authorization failed.'),
      createNativeErrorOptions(options.cause),
    );

    this.name = 'AuthorizationError';
  }
}
