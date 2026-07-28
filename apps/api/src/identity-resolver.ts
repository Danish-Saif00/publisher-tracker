import { AuthorizationError } from '@affiliate-tracker/auth';
import type {
  AuthenticatedActor,
  AuthorizationSubject,
  CompanyMembershipIdentity,
  CompanyMembershipStatus,
  CompanyRole,
  PlatformRole,
} from '@affiliate-tracker/contracts';
import type { DatabaseExecutionContext, DatabaseRuntime } from '@affiliate-tracker/database';

import { ApiHttpError } from './api.errors.js';

type UserStatus = 'active' | 'suspended';

type CompanyStatus = 'active' | 'suspended' | 'archived';

type UserProfileRow = Readonly<{
  platform_role: string | null;
  status: string;
}> &
  Record<string, unknown>;

type CompanyStatusRow = Readonly<{
  status: string;
}> &
  Record<string, unknown>;

type CompanyMembershipRow = Readonly<{
  id: string;
  company_id: string;
  user_id: string;
  role: string;
  status: string;
}> &
  Record<string, unknown>;

type CompanySubscriptionAccessRow = Readonly<{
  allowed: boolean;
  reason: string;
}> &
  Record<string, unknown>;

export interface ResolveApiIdentityInput {
  readonly actor: AuthenticatedActor;
  readonly requestId: string;
  readonly requestedCompanyId?: string;
}

export interface ResolvedApiIdentity {
  readonly actor: AuthenticatedActor;
  readonly subject: AuthorizationSubject;
  readonly requestedCompanyId?: string;
  readonly companyMembership?: CompanyMembershipIdentity;
}

export interface ApiIdentityResolver {
  resolve(input: ResolveApiIdentityInput): Promise<ResolvedApiIdentity>;
}

function parseUserStatus(value: unknown): UserStatus {
  if (value === 'active' || value === 'suspended') {
    return value;
  }

  throw new Error('The database returned an unsupported user status.');
}

function parseCompanyStatus(value: unknown): CompanyStatus {
  switch (value) {
    case 'active':
    case 'suspended':
    case 'archived':
      return value;
    default:
      throw new Error('The database returned an unsupported company status.');
  }
}

function parsePlatformRole(value: unknown): PlatformRole | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  if (value === 'platform_super_admin') {
    return value;
  }

  throw new Error('The database returned an unsupported platform role.');
}

function parseCompanyRole(value: unknown): CompanyRole {
  switch (value) {
    case 'company_admin':
    case 'manager':
    case 'publisher':
      return value;
    default:
      throw new Error('The database returned an unsupported company role.');
  }
}

function parseMembershipStatus(value: unknown): CompanyMembershipStatus {
  switch (value) {
    case 'invited':
    case 'active':
    case 'suspended':
    case 'revoked':
      return value;
    default:
      throw new Error('The database returned an unsupported membership status.');
  }
}

function readRequiredString(value: unknown, columnName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`The database column "${columnName}" is invalid.`);
  }

  return value;
}

function assertCompanySubscriptionAccess(row: CompanySubscriptionAccessRow | undefined): void {
  if (row === undefined || row.allowed) {
    return;
  }

  switch (row.reason) {
    case 'no_subscription':
      throw new ApiHttpError(
        'COMPANY_SUBSCRIPTION_REQUIRED',
        402,
        'This company does not have an active subscription. Contact the Platform Super Admin.',
      );
    case 'subscription_not_started':
      throw new ApiHttpError(
        'COMPANY_SUBSCRIPTION_NOT_STARTED',
        402,
        'This company subscription has not started yet.',
      );
    case 'trial_expired':
    case 'period_expired':
    case 'grace_expired':
    case 'subscription_suspended':
    case 'subscription_canceled':
    case 'subscription_expired':
      throw new ApiHttpError(
        'COMPANY_SUBSCRIPTION_EXPIRED',
        402,
        'This company subscription is expired or unavailable. Contact the Platform Super Admin to renew access.',
      );
    default:
      throw new Error('The database returned an unsupported company subscription access reason.');
  }
}

function createMembershipIdentity(
  row: CompanyMembershipRow,
  actor: AuthenticatedActor,
  requestedCompanyId: string,
): CompanyMembershipIdentity {
  const membershipId = readRequiredString(row.id, 'id');
  const companyId = readRequiredString(row.company_id, 'company_id');
  const userId = readRequiredString(row.user_id, 'user_id');

  if (companyId !== requestedCompanyId || userId !== actor.userId) {
    throw new Error('The resolved company membership does not match the authenticated request.');
  }

  return Object.freeze({
    membershipId,
    companyId,
    userId,
    role: parseCompanyRole(row.role),
    status: parseMembershipStatus(row.status),
  });
}

export function createApiIdentityResolver(database: DatabaseRuntime): ApiIdentityResolver {
  return Object.freeze<ApiIdentityResolver>({
    async resolve(input): Promise<ResolvedApiIdentity> {
      const sessionContext: DatabaseExecutionContext = {
        actorUserId: input.actor.userId,
        requestId: input.requestId,
        ...(input.requestedCompanyId !== undefined
          ? {
              companyId: input.requestedCompanyId,
            }
          : {}),
      };

      return database.transaction(
        async (transaction) => {
          const profileResult = await transaction.query<UserProfileRow>({
            name: 'api-resolve-user-profile',
            text: `
                select
                  platform_role,
                  status
                from public.user_profiles
                where user_id = $1
                limit 1
              `,
            values: [input.actor.userId],
          });

          const profile = profileResult.rows[0];

          if (profile === undefined) {
            throw new AuthorizationError(
              'ACCOUNT_ACCESS_DENIED',
              'The authenticated user profile is unavailable.',
            );
          }

          if (parseUserStatus(profile.status) !== 'active') {
            throw new AuthorizationError(
              'ACCOUNT_ACCESS_DENIED',
              'The authenticated user account is suspended.',
            );
          }

          const platformRole = parsePlatformRole(profile.platform_role);

          const subject: AuthorizationSubject = Object.freeze({
            userId: input.actor.userId,
            ...(platformRole !== undefined
              ? {
                  platformRole,
                }
              : {}),
          });

          let companyMembership: CompanyMembershipIdentity | undefined;

          if (input.requestedCompanyId !== undefined) {
            const companyResult = await transaction.query<CompanyStatusRow>({
              name: 'api-resolve-company-status',
              text: `
                  select
                    status
                  from public.companies
                  where id = $1
                  limit 1
                `,
              values: [input.requestedCompanyId],
            });

            const companyRow = companyResult.rows[0];

            if (
              companyRow === undefined ||
              (platformRole === undefined && parseCompanyStatus(companyRow.status) !== 'active')
            ) {
              throw new AuthorizationError(
                'COMPANY_ACCESS_DENIED',
                'Access to the requested company is denied.',
              );
            }

            const membershipResult = await transaction.query<CompanyMembershipRow>({
              name: 'api-resolve-company-membership',
              text: `
                  select
                    id,
                    company_id,
                    user_id,
                    role,
                    status
                  from public.company_memberships
                  where company_id = $1
                    and user_id = $2
                  limit 1
                `,
              values: [input.requestedCompanyId, input.actor.userId],
            });

            const membershipRow = membershipResult.rows[0];

            if (membershipRow !== undefined) {
              companyMembership = createMembershipIdentity(
                membershipRow,
                input.actor,
                input.requestedCompanyId,
              );
            }

            if (
              platformRole === undefined &&
              companyMembership?.status === 'active'
            ) {
              const subscriptionAccessResult =
                await transaction.query<CompanySubscriptionAccessRow>({
                  name: 'api-resolve-company-subscription-access',
                  text: `
                    select
                      case
                        when subscription.id is null then false
                        when subscription.starts_at > now() then false
                        when subscription.status = 'trialing' then
                          subscription.trial_ends_at is not null
                          and subscription.trial_ends_at > now()
                        when subscription.status = 'active' then
                          subscription.current_period_ends_at is null
                          or subscription.current_period_ends_at > now()
                        when subscription.status = 'grace_period' then
                          subscription.grace_ends_at is not null
                          and subscription.grace_ends_at > now()
                        else false
                      end as allowed,
                      case
                        when subscription.id is null then 'no_subscription'
                        when subscription.starts_at > now() then 'subscription_not_started'
                        when subscription.status = 'trialing'
                          and (
                            subscription.trial_ends_at is null
                            or subscription.trial_ends_at <= now()
                          ) then 'trial_expired'
                        when subscription.status = 'active'
                          and subscription.current_period_ends_at is not null
                          and subscription.current_period_ends_at <= now()
                          then 'period_expired'
                        when subscription.status = 'grace_period'
                          and (
                            subscription.grace_ends_at is null
                            or subscription.grace_ends_at <= now()
                          ) then 'grace_expired'
                        when subscription.status = 'suspended' then 'subscription_suspended'
                        when subscription.status = 'canceled' then 'subscription_canceled'
                        when subscription.status = 'expired' then 'subscription_expired'
                        else 'active'
                      end as reason
                    from (select $1::uuid as company_id) as requested
                    left join public.company_subscriptions as subscription
                      on subscription.company_id = requested.company_id
                    limit 1
                  `,
                  values: [input.requestedCompanyId],
                });

              assertCompanySubscriptionAccess(
                subscriptionAccessResult.rows[0],
              );
            }
          }

          return Object.freeze({
            actor: input.actor,
            subject,
            ...(input.requestedCompanyId !== undefined
              ? {
                  requestedCompanyId: input.requestedCompanyId,
                }
              : {}),
            ...(companyMembership !== undefined
              ? {
                  companyMembership,
                }
              : {}),
          });
        },
        {
          readOnly: true,
          sessionContext,
        },
      );
    },
  });
}
