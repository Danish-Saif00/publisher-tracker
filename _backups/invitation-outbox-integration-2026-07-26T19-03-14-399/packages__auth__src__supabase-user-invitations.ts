import { createClient } from '@supabase/supabase-js';

import { AuthenticationConfigurationError } from './auth.errors.js';

export interface CreateSupabaseUserInvitationGatewayOptions {
  readonly supabaseUrl: string;
  readonly secretKey: string;
}

export interface GenerateNewSupabaseUserInviteLinkInput {
  readonly email: string;
  readonly redirectTo: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface GenerateExistingSupabaseUserLinkInput {
  readonly email: string;
  readonly redirectTo: string;
}

export interface SupabaseUserInvitationLink {
  readonly userId: string;
  readonly actionLink: string;
}

export interface SupabaseUserInvitationGateway {
  generateNewUserInviteLink(
    input: GenerateNewSupabaseUserInviteLinkInput,
  ): Promise<SupabaseUserInvitationLink>;

  generateExistingUserMagicLink(
    input: GenerateExistingSupabaseUserLinkInput,
  ): Promise<SupabaseUserInvitationLink>;

  generatePasswordSetupLink(
    input: GenerateExistingSupabaseUserLinkInput,
  ): Promise<SupabaseUserInvitationLink>;
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
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseGeneratedLink(value: unknown): SupabaseUserInvitationLink {
  if (!isRecord(value)) {
    throw new Error('Supabase returned an invalid generated-link response.');
  }

  const user = value['user'];
  const properties = value['properties'];

  if (!isRecord(user) || !isRecord(properties)) {
    throw new Error('Supabase returned incomplete generated-link data.');
  }

  const userId = user['id'];
  const actionLink = properties['action_link'];

  if (typeof userId !== 'string' || userId.trim().length === 0) {
    throw new Error('Supabase returned an invalid generated-link user identifier.');
  }

  if (typeof actionLink !== 'string' || actionLink.trim().length === 0) {
    throw new Error('Supabase returned an invalid generated action link.');
  }

  return Object.freeze({
    userId: userId.trim(),
    actionLink: actionLink.trim(),
  });
}

export function createSupabaseUserInvitationGateway(
  options: CreateSupabaseUserInvitationGatewayOptions,
): SupabaseUserInvitationGateway {
  const supabaseUrl = normalizeRequiredValue(options.supabaseUrl, 'Supabase URL');
  const secretKey = normalizeRequiredValue(options.secretKey, 'Supabase secret key');
  const adminClient = createServerClient(supabaseUrl, secretKey);

  return Object.freeze<SupabaseUserInvitationGateway>({
    async generateNewUserInviteLink(
      input: GenerateNewSupabaseUserInviteLinkInput,
    ): Promise<SupabaseUserInvitationLink> {
      const { data, error } = await adminClient.auth.admin.generateLink({
        type: 'invite',
        email: input.email,
        options: {
          redirectTo: input.redirectTo,
          ...(input.metadata === undefined ? {} : { data: input.metadata }),
        },
      });

      if (error !== null) {
        throw new Error('Supabase could not generate the new-user invitation link.', {
          cause: error,
        });
      }

      return parseGeneratedLink(data);
    },

    async generateExistingUserMagicLink(
      input: GenerateExistingSupabaseUserLinkInput,
    ): Promise<SupabaseUserInvitationLink> {
      const { data, error } = await adminClient.auth.admin.generateLink({
        type: 'magiclink',
        email: input.email,
        options: {
          redirectTo: input.redirectTo,
        },
      });

      if (error !== null) {
        throw new Error('Supabase could not generate the existing-user access link.', {
          cause: error,
        });
      }

      return parseGeneratedLink(data);
    },

    async generatePasswordSetupLink(
      input: GenerateExistingSupabaseUserLinkInput,
    ): Promise<SupabaseUserInvitationLink> {
      const { data, error } = await adminClient.auth.admin.generateLink({
        type: 'recovery',
        email: input.email,
        options: {
          redirectTo: input.redirectTo,
        },
      });

      if (error !== null) {
        throw new Error('Supabase could not generate the password-setup link.', {
          cause: error,
        });
      }

      return parseGeneratedLink(data);
    },
  });
}
