import { createClient } from '@supabase/supabase-js';

import { AuthenticationConfigurationError } from './auth.errors.js';

export interface CreateSupabaseManagedUsersGatewayOptions {
  readonly supabaseUrl: string;
  readonly secretKey: string;
}

export interface CreateSupabaseManagedUserInput {
  readonly email: string;
  readonly password: string;
}

export interface UpdateSupabaseManagedUserInput {
  readonly email?: string;
  readonly password?: string;
}

export interface SupabaseManagedUserRecord {
  readonly userId: string;
  readonly email: string;
}

export type SupabaseManagedUserErrorCode =
  'USER_ALREADY_EXISTS' | 'MANAGED_USER_NOT_FOUND' | 'MANAGED_USER_OPERATION_FAILED';

export class SupabaseManagedUserError extends Error {
  readonly code: SupabaseManagedUserErrorCode;

  constructor(code: SupabaseManagedUserErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SupabaseManagedUserError';
    this.code = code;
  }
}

export interface SupabaseManagedUsersGateway {
  createManagedUser(input: CreateSupabaseManagedUserInput): Promise<SupabaseManagedUserRecord>;

  updateManagedUser(
    userId: string,
    input: UpdateSupabaseManagedUserInput,
  ): Promise<SupabaseManagedUserRecord>;

  updateManagedUserPassword(userId: string, password: string): Promise<void>;

  deleteManagedUser(userId: string): Promise<void>;
}

function normalizeRequiredValue(value: string, fieldName: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw new AuthenticationConfigurationError(`${fieldName} cannot be empty.`);
  }

  return normalizedValue;
}

function createServerClient(url: string, key: string) {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readErrorCode(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const code = value['code'];
  return typeof code === 'string' ? code : undefined;
}

function readErrorStatus(value: unknown): number | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const status = value['status'];
  return typeof status === 'number' ? status : undefined;
}

function readErrorMessage(value: unknown): string {
  if (!isRecord(value)) {
    return '';
  }

  const message = value['message'];
  return typeof message === 'string' ? message.toLowerCase() : '';
}

function isExistingUserError(error: unknown): boolean {
  const code = readErrorCode(error);
  const message = readErrorMessage(error);

  return (
    code === 'email_exists' ||
    code === 'user_already_exists' ||
    (readErrorStatus(error) === 422 &&
      (message.includes('already registered') ||
        message.includes('already exists') ||
        message.includes('already been registered')))
  );
}

function isMissingUserError(error: unknown): boolean {
  const code = readErrorCode(error);
  const message = readErrorMessage(error);

  return (
    code === 'user_not_found' ||
    readErrorStatus(error) === 404 ||
    message.includes('user not found')
  );
}

export function createSupabaseManagedUsersGateway(
  options: CreateSupabaseManagedUsersGatewayOptions,
): SupabaseManagedUsersGateway {
  const supabaseUrl = normalizeRequiredValue(options.supabaseUrl, 'Supabase URL');
  const secretKey = normalizeRequiredValue(options.secretKey, 'Supabase secret key');
  const adminClient = createServerClient(supabaseUrl, secretKey);

  return Object.freeze<SupabaseManagedUsersGateway>({
    async createManagedUser(
      input: CreateSupabaseManagedUserInput,
    ): Promise<SupabaseManagedUserRecord> {
      const { data, error } = await adminClient.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: true,
      });

      if (error !== null) {
        if (isExistingUserError(error)) {
          throw new SupabaseManagedUserError(
            'USER_ALREADY_EXISTS',
            'A user with this email address already exists.',
            { cause: error },
          );
        }

        throw new SupabaseManagedUserError(
          'MANAGED_USER_OPERATION_FAILED',
          'Supabase could not create the managed user.',
          { cause: error },
        );
      }

      const user = data.user;
      const email = user.email;

      if (typeof email !== 'string' || email.length === 0) {
        throw new SupabaseManagedUserError(
          'MANAGED_USER_OPERATION_FAILED',
          'Supabase returned incomplete managed-user data.',
        );
      }

      return Object.freeze({
        userId: user.id,
        email,
      });
    },

    async updateManagedUser(
      userId: string,
      input: UpdateSupabaseManagedUserInput,
    ): Promise<SupabaseManagedUserRecord> {
      const { data, error } = await adminClient.auth.admin.updateUserById(userId, {
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.password !== undefined ? { password: input.password } : {}),
      });

      if (error !== null) {
        if (isExistingUserError(error)) {
          throw new SupabaseManagedUserError(
            'USER_ALREADY_EXISTS',
            'A user with this email address already exists.',
            { cause: error },
          );
        }

        if (isMissingUserError(error)) {
          throw new SupabaseManagedUserError(
            'MANAGED_USER_NOT_FOUND',
            'The managed authentication user was not found.',
            { cause: error },
          );
        }

        throw new SupabaseManagedUserError(
          'MANAGED_USER_OPERATION_FAILED',
          'Supabase could not update the managed user.',
          { cause: error },
        );
      }

      const email = data.user.email;
      if (typeof email !== 'string' || email.length === 0) {
        throw new SupabaseManagedUserError(
          'MANAGED_USER_OPERATION_FAILED',
          'Supabase returned incomplete managed-user data.',
        );
      }

      return Object.freeze({
        userId: data.user.id,
        email,
      });
    },

    async updateManagedUserPassword(userId: string, password: string): Promise<void> {
      const { error } = await adminClient.auth.admin.updateUserById(userId, {
        password,
      });

      if (error !== null) {
        if (isMissingUserError(error)) {
          throw new SupabaseManagedUserError(
            'MANAGED_USER_NOT_FOUND',
            'The managed authentication user was not found.',
            { cause: error },
          );
        }

        throw new SupabaseManagedUserError(
          'MANAGED_USER_OPERATION_FAILED',
          'Supabase could not update the managed user password.',
          { cause: error },
        );
      }
    },

    async deleteManagedUser(userId: string): Promise<void> {
      const { error } = await adminClient.auth.admin.deleteUser(userId, true);

      if (error !== null && !isMissingUserError(error)) {
        throw new SupabaseManagedUserError(
          'MANAGED_USER_OPERATION_FAILED',
          'Supabase could not roll back the managed user.',
          { cause: error },
        );
      }
    },
  });
}
