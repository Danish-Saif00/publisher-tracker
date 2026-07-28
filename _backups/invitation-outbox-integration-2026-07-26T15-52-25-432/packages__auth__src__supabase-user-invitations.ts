import { createClient } from '@supabase/supabase-js';

import { AuthenticationConfigurationError } from './auth.errors.js';

export interface CreateSupabaseUserInvitationGatewayOptions {
  readonly supabaseUrl: string;
  readonly publishableKey: string;
  readonly secretKey: string;
}

export interface InviteNewSupabaseUserInput {
  readonly email: string;
  readonly redirectTo: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface SendExistingSupabaseUserLinkInput {
  readonly email: string;
  readonly redirectTo: string;
}

export interface SupabaseUserInvitationGateway {
  inviteNewUser(input: InviteNewSupabaseUserInput): Promise<{ readonly userId: string }>;
  sendExistingUserLink(input: SendExistingSupabaseUserLinkInput): Promise<void>;
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

export function createSupabaseUserInvitationGateway(
  options: CreateSupabaseUserInvitationGatewayOptions,
): SupabaseUserInvitationGateway {
  const supabaseUrl = normalizeRequiredValue(options.supabaseUrl, 'Supabase URL');
  const publishableKey = normalizeRequiredValue(options.publishableKey, 'Supabase publishable key');
  const secretKey = normalizeRequiredValue(options.secretKey, 'Supabase secret key');
  const adminClient = createServerClient(supabaseUrl, secretKey);
  const publicClient = createServerClient(supabaseUrl, publishableKey);

  return Object.freeze<SupabaseUserInvitationGateway>({
    async inviteNewUser(input): Promise<{ readonly userId: string }> {
      const { data, error } = await adminClient.auth.admin.inviteUserByEmail(input.email, {
        redirectTo: input.redirectTo,
        ...(input.metadata !== undefined
          ? {
              data: input.metadata,
            }
          : {}),
      });

      if (error !== null) {
        throw new Error('Supabase could not deliver the user invitation.', {
          cause: error,
        });
      }

      const userId = data.user.id;

      if (typeof userId !== 'string' || userId.trim().length === 0) {
        throw new Error('Supabase returned an invalid invited user identifier.');
      }

      return Object.freeze({
        userId,
      });
    },

    async sendExistingUserLink(input): Promise<void> {
      const { error } = await publicClient.auth.signInWithOtp({
        email: input.email,
        options: {
          emailRedirectTo: input.redirectTo,
          shouldCreateUser: false,
        },
      });

      if (error !== null) {
        throw new Error('Supabase could not deliver the existing-user access link.', {
          cause: error,
        });
      }
    },
  });
}
