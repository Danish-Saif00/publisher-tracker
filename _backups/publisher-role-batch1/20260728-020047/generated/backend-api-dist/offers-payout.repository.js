function normalizeTimestamp(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error('The database returned an invalid timestamp.');
    }
    return date.toISOString();
}
function normalizeInteger(value, columnName) {
    const normalizedValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(normalizedValue)) {
        throw new Error(`The database column "${columnName}" is not a safe integer.`);
    }
    return normalizedValue;
}
function normalizeOptionalInteger(value, columnName) {
    return value === null ? null : normalizeInteger(value, columnName);
}
function parseCompanyStatus(value) {
    switch (value) {
        case 'active':
        case 'suspended':
        case 'archived':
            return value;
        default:
            throw new Error('The database returned an unsupported company status.');
    }
}
function parseNetworkAccountStatus(value) {
    switch (value) {
        case 'active':
        case 'suspended':
        case 'archived':
            return value;
        default:
            throw new Error('The database returned an unsupported network-account status.');
    }
}
function parseOfferStatus(value) {
    switch (value) {
        case 'draft':
        case 'active':
        case 'paused':
        case 'archived':
            return value;
        default:
            throw new Error('The database returned an unsupported offer status.');
    }
}
function parsePayoutMode(value) {
    switch (value) {
        case 'fixed_member':
        case 'per_offer':
            return value;
        default:
            throw new Error('The database returned an unsupported payout mode.');
    }
}
function parseAssignmentStatus(value) {
    switch (value) {
        case 'active':
        case 'paused':
        case 'revoked':
            return value;
        default:
            throw new Error('The database returned an unsupported offer-assignment status.');
    }
}
function parseCompanyRole(value) {
    switch (value) {
        case 'manager':
        case 'publisher':
            return value;
        default:
            throw new Error('The database returned an unsupported payout-member role.');
    }
}
function parseMembershipStatus(value) {
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
function mapCompanyRow(row) {
    return Object.freeze({
        id: row.id,
        status: parseCompanyStatus(row.status),
    });
}
function mapPayoutMemberRow(row) {
    return Object.freeze({
        membershipId: row.id,
        companyId: row.company_id,
        userId: row.user_id,
        role: parseCompanyRole(row.role),
        status: parseMembershipStatus(row.status),
        invitedBy: row.invited_by,
    });
}
function mapNetworkAccountRow(row) {
    return Object.freeze({
        id: row.id,
        companyId: row.company_id,
        status: parseNetworkAccountStatus(row.status),
    });
}
function mapOfferRow(row) {
    return Object.freeze({
        id: row.id,
        companyId: row.company_id,
        networkAccountId: row.network_account_id,
        networkAccountName: row.network_account_name,
        providerId: row.provider_id,
        providerCode: row.provider_code,
        providerName: row.provider_name,
        code: row.code,
        externalOfferId: row.external_offer_id,
        name: row.name,
        description: row.description,
        destinationUrl: row.destination_url,
        status: parseOfferStatus(row.status),
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        createdAt: normalizeTimestamp(row.created_at),
        updatedAt: normalizeTimestamp(row.updated_at),
    });
}
function mapPayoutProfileRow(row) {
    return Object.freeze({
        id: row.id,
        companyId: row.company_id,
        membershipId: row.membership_id,
        userId: row.user_id,
        role: parseCompanyRole(row.role),
        membershipStatus: parseMembershipStatus(row.membership_status),
        mode: parsePayoutMode(row.mode),
        fixedPayoutAmountMinor: normalizeOptionalInteger(row.fixed_payout_amount_minor, 'fixed_payout_amount_minor'),
        payoutCurrency: row.payout_currency,
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        createdAt: normalizeTimestamp(row.created_at),
        updatedAt: normalizeTimestamp(row.updated_at),
    });
}
function mapAssignmentRow(row) {
    return Object.freeze({
        id: row.id,
        companyId: row.company_id,
        offerId: row.offer_id,
        offerCode: row.offer_code,
        offerName: row.offer_name,
        membershipId: row.membership_id,
        managerMembershipId: row.manager_membership_id,
        userId: row.user_id,
        role: parseCompanyRole(row.role),
        membershipStatus: parseMembershipStatus(row.membership_status),
        status: parseAssignmentStatus(row.status),
        manualPayoutAmountMinor: normalizeOptionalInteger(row.manual_payout_amount_minor, 'manual_payout_amount_minor'),
        manualPayoutCurrency: row.manual_payout_currency,
        payoutMode: parsePayoutMode(row.payout_mode),
        resolvedPayoutAmountMinor: normalizeInteger(row.resolved_payout_amount_minor, 'resolved_payout_amount_minor'),
        resolvedPayoutCurrency: row.resolved_payout_currency,
        assignedBy: row.assigned_by,
        updatedBy: row.updated_by,
        createdAt: normalizeTimestamp(row.created_at),
        updatedAt: normalizeTimestamp(row.updated_at),
    });
}
function createDatabaseSessionContext(context) {
    return {
        actorUserId: context.actorUserId,
        requestId: context.requestId,
        ...(context.companyId !== undefined ? { companyId: context.companyId } : {}),
    };
}
function offerProjection(source) {
    return `
    ${source}.id,
    ${source}.company_id,
    ${source}.network_account_id,
    account.name as network_account_name,
    provider.id as provider_id,
    provider.code as provider_code,
    provider.name as provider_name,
    ${source}.code,
    ${source}.external_offer_id,
    ${source}.name,
    ${source}.description,
    ${source}.destination_url,
    ${source}.status,
    ${source}.created_by,
    ${source}.updated_by,
    ${source}.created_at,
    ${source}.updated_at
  `;
}
function payoutProfileProjection(source) {
    return `
    ${source}.id,
    ${source}.company_id,
    ${source}.membership_id,
    membership.user_id,
    membership.role,
    membership.status as membership_status,
    ${source}.mode,
    ${source}.fixed_payout_amount_minor,
    ${source}.payout_currency,
    ${source}.created_by,
    ${source}.updated_by,
    ${source}.created_at,
    ${source}.updated_at
  `;
}
function assignmentProjection(source) {
    return `
    ${source}.id,
    ${source}.company_id,
    ${source}.offer_id,
    offer.code as offer_code,
    offer.name as offer_name,
    ${source}.membership_id,
    ${source}.manager_membership_id,
    membership.user_id,
    membership.role,
    membership.status as membership_status,
    ${source}.status,
    ${source}.manual_payout_amount_minor,
    ${source}.manual_payout_currency,
    profile.mode as payout_mode,
    case
      when profile.mode = 'fixed_member'
      then profile.fixed_payout_amount_minor
      else ${source}.manual_payout_amount_minor
    end as resolved_payout_amount_minor,
    case
      when profile.mode = 'fixed_member'
      then profile.payout_currency
      else ${source}.manual_payout_currency
    end as resolved_payout_currency,
    ${source}.assigned_by,
    ${source}.updated_by,
    ${source}.created_at,
    ${source}.updated_at
  `;
}
async function writeAuditEvent(transaction, input) {
    await transaction.query({
        name: 'offers-payout-write-audit-event',
        text: `
      insert into public.audit_events (
        company_id,
        actor_user_id,
        request_id,
        event_name,
        entity_type,
        entity_id,
        metadata
      )
      values (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7::jsonb
      )
    `,
        values: [
            input.companyId,
            input.actorUserId,
            input.requestId,
            input.eventName,
            input.entityType,
            input.entityId,
            JSON.stringify(input.metadata),
        ],
    });
}
export function createOffersPayoutRepository(database) {
    return Object.freeze({
        async getCompany(context, companyId) {
            return database.transaction(async (transaction) => {
                const result = await transaction.query({
                    name: 'offers-payout-get-company',
                    text: `
              select id, status
              from public.companies
              where id = $1
              limit 1
            `,
                    values: [companyId],
                });
                const row = result.rows[0];
                return row === undefined ? undefined : mapCompanyRow(row);
            }, {
                readOnly: true,
                sessionContext: createDatabaseSessionContext(context),
            });
        },
        async getEligibleMembership(context, companyId, membershipId) {
            return database.transaction(async (transaction) => {
                const result = await transaction.query({
                    name: 'offers-payout-get-eligible-membership',
                    text: `
              select id, company_id, user_id, role, status, invited_by
              from public.company_memberships
              where id = $1
                and company_id = $2
                and role in ('manager', 'publisher')
              limit 1
            `,
                    values: [membershipId, companyId],
                });
                const row = result.rows[0];
                return row === undefined ? undefined : mapPayoutMemberRow(row);
            }, {
                readOnly: true,
                sessionContext: createDatabaseSessionContext(context),
            });
        },
        async getNetworkAccount(context, companyId, networkAccountId) {
            return database.transaction(async (transaction) => {
                const result = await transaction.query({
                    name: 'offers-payout-get-network-account',
                    text: `
              select id, company_id, status
              from public.network_accounts
              where id = $1
                and company_id = $2
              limit 1
            `,
                    values: [networkAccountId, companyId],
                });
                const row = result.rows[0];
                return row === undefined ? undefined : mapNetworkAccountRow(row);
            }, {
                readOnly: true,
                sessionContext: createDatabaseSessionContext(context),
            });
        },
        async createOffer(context, companyId, input) {
            return database.transaction(async (transaction) => {
                const result = await transaction.query({
                    name: 'offers-payout-create-offer',
                    text: `
              with inserted as (
                insert into public.offers (
                  company_id,
                  network_account_id,
                  code,
                  external_offer_id,
                  name,
                  description,
                  destination_url,
                  status,
                  created_by,
                  updated_by
                )
                values (
                  $1,
                  $2,
                  $3,
                  $4,
                  $5,
                  $6,
                  $7,
                  $8::public.offer_status,
                  $9,
                  $9
                )
                on conflict do nothing
                returning *
              )
              select
                ${offerProjection('inserted')}
              from inserted
              inner join public.network_accounts as account
                on account.id = inserted.network_account_id
              inner join public.network_providers as provider
                on provider.id = account.provider_id
            `,
                    values: [
                        companyId,
                        input.networkAccountId,
                        input.code,
                        input.externalOfferId,
                        input.name,
                        input.description,
                        input.destinationUrl,
                        input.status,
                        context.actorUserId,
                    ],
                });
                const row = result.rows[0];
                if (row === undefined) {
                    return undefined;
                }
                const offer = mapOfferRow(row);
                await writeAuditEvent(transaction, {
                    companyId,
                    actorUserId: context.actorUserId,
                    requestId: context.requestId,
                    eventName: 'offer.created',
                    entityType: 'offer',
                    entityId: offer.id,
                    metadata: {
                        code: offer.code,
                        networkAccountId: offer.networkAccountId,
                        status: offer.status,
                    },
                });
                return offer;
            }, {
                sessionContext: createDatabaseSessionContext(context),
            });
        },
        async listOffers(context, companyId, query) {
            return database.transaction(async (transaction) => {
                const values = [companyId];
                const conditions = ['offer.company_id = $1'];
                if (query.networkAccountId !== undefined) {
                    values.push(query.networkAccountId);
                    conditions.push(`offer.network_account_id = $${String(values.length)}::uuid`);
                }
                if (query.status !== undefined) {
                    values.push(query.status);
                    conditions.push(`offer.status = $${String(values.length)}::public.offer_status`);
                }
                if (query.visibleToUserId !== undefined) {
                    values.push(query.visibleToUserId);
                    const parameter = `$${String(values.length)}`;
                    conditions.push(`
              exists (
                select 1
                from public.offer_assignments as assignment
                inner join public.company_memberships as membership
                  on membership.id = assignment.membership_id
                where assignment.offer_id = offer.id
                  and assignment.status = 'active'
                  and membership.user_id = ${parameter}::uuid
                  and membership.status = 'active'
              )
            `);
                    conditions.push(`offer.status = 'active'`);
                }
                const result = await transaction.query({
                    name: 'offers-payout-list-offers',
                    text: `
              select
                ${offerProjection('offer')}
              from public.offers as offer
              inner join public.network_accounts as account
                on account.id = offer.network_account_id
              inner join public.network_providers as provider
                on provider.id = account.provider_id
              where ${conditions.join('\n                and ')}
              order by offer.created_at desc, offer.id desc
            `,
                    values,
                });
                return Object.freeze(result.rows.map(mapOfferRow));
            }, {
                readOnly: true,
                sessionContext: createDatabaseSessionContext(context),
            });
        },
        async getOffer(context, companyId, offerId, visibleToUserId) {
            return database.transaction(async (transaction) => {
                const values = [offerId, companyId];
                const conditions = ['offer.id = $1', 'offer.company_id = $2'];
                if (visibleToUserId !== undefined) {
                    values.push(visibleToUserId);
                    const parameter = `$${String(values.length)}`;
                    conditions.push(`
              exists (
                select 1
                from public.offer_assignments as assignment
                inner join public.company_memberships as membership
                  on membership.id = assignment.membership_id
                where assignment.offer_id = offer.id
                  and assignment.status = 'active'
                  and membership.user_id = ${parameter}::uuid
                  and membership.status = 'active'
              )
            `);
                    conditions.push(`offer.status = 'active'`);
                }
                const result = await transaction.query({
                    name: 'offers-payout-get-offer',
                    text: `
              select
                ${offerProjection('offer')}
              from public.offers as offer
              inner join public.network_accounts as account
                on account.id = offer.network_account_id
              inner join public.network_providers as provider
                on provider.id = account.provider_id
              where ${conditions.join('\n                and ')}
              limit 1
            `,
                    values,
                });
                const row = result.rows[0];
                return row === undefined ? undefined : mapOfferRow(row);
            }, {
                readOnly: true,
                sessionContext: createDatabaseSessionContext(context),
            });
        },
        async updateOffer(context, current, input) {
            return database.transaction(async (transaction) => {
                const result = await transaction.query({
                    name: 'offers-payout-update-offer',
                    text: `
              with updated as (
                update public.offers
                set
                  external_offer_id = $3,
                  name = $4,
                  description = $5,
                  destination_url = $6,
                  status = $7::public.offer_status,
                  updated_by = $8
                where id = $1
                  and company_id = $2
                  and date_trunc('milliseconds', updated_at) = $9::timestamptz
                returning *
              )
              select
                ${offerProjection('updated')}
              from updated
              inner join public.network_accounts as account
                on account.id = updated.network_account_id
              inner join public.network_providers as provider
                on provider.id = account.provider_id
            `,
                    values: [
                        current.id,
                        current.companyId,
                        input.externalOfferId,
                        input.name,
                        input.description,
                        input.destinationUrl,
                        input.status,
                        context.actorUserId,
                        current.updatedAt,
                    ],
                });
                const row = result.rows[0];
                if (row === undefined) {
                    return undefined;
                }
                const offer = mapOfferRow(row);
                await writeAuditEvent(transaction, {
                    companyId: current.companyId,
                    actorUserId: context.actorUserId,
                    requestId: context.requestId,
                    eventName: 'offer.updated',
                    entityType: 'offer',
                    entityId: offer.id,
                    metadata: {
                        previousStatus: current.status,
                        status: offer.status,
                        externalOfferId: offer.externalOfferId,
                    },
                });
                return offer;
            }, {
                sessionContext: createDatabaseSessionContext(context),
            });
        },
        async getPayoutProfile(context, companyId, membershipId) {
            return database.transaction(async (transaction) => {
                const result = await transaction.query({
                    name: 'offers-payout-get-profile',
                    text: `
              select
                ${payoutProfileProjection('profile')}
              from public.member_payout_profiles as profile
              inner join public.company_memberships as membership
                on membership.id = profile.membership_id
              where profile.company_id = $1
                and profile.membership_id = $2
              limit 1
            `,
                    values: [companyId, membershipId],
                });
                const row = result.rows[0];
                return row === undefined ? undefined : mapPayoutProfileRow(row);
            }, {
                readOnly: true,
                sessionContext: createDatabaseSessionContext(context),
            });
        },
        async listPayoutProfiles(context, companyId) {
            return database.transaction(async (transaction) => {
                const result = await transaction.query({
                    name: 'offers-payout-list-profiles',
                    text: `
              select
                ${payoutProfileProjection('profile')}
              from public.member_payout_profiles as profile
              inner join public.company_memberships as membership
                on membership.id = profile.membership_id
              where profile.company_id = $1
              order by profile.created_at desc, profile.id desc
            `,
                    values: [companyId],
                });
                return Object.freeze(result.rows.map(mapPayoutProfileRow));
            }, {
                readOnly: true,
                sessionContext: createDatabaseSessionContext(context),
            });
        },
        async createPayoutProfile(context, companyId, membershipId, input) {
            return database.transaction(async (transaction) => {
                const result = await transaction.query({
                    name: 'offers-payout-create-profile',
                    text: `
              with inserted as (
                insert into public.member_payout_profiles (
                  company_id,
                  membership_id,
                  mode,
                  fixed_payout_amount_minor,
                  payout_currency,
                  created_by,
                  updated_by
                )
                values (
                  $1,
                  $2,
                  $3::public.payout_mode,
                  $4,
                  $5,
                  $6,
                  $6
                )
                on conflict do nothing
                returning *
              )
              select
                ${payoutProfileProjection('inserted')}
              from inserted
              inner join public.company_memberships as membership
                on membership.id = inserted.membership_id
            `,
                    values: [
                        companyId,
                        membershipId,
                        input.mode,
                        input.fixedPayoutAmountMinor,
                        input.payoutCurrency,
                        context.actorUserId,
                    ],
                });
                const row = result.rows[0];
                if (row === undefined) {
                    return undefined;
                }
                const profile = mapPayoutProfileRow(row);
                await writeAuditEvent(transaction, {
                    companyId,
                    actorUserId: context.actorUserId,
                    requestId: context.requestId,
                    eventName: 'payout_profile.created',
                    entityType: 'member_payout_profile',
                    entityId: profile.id,
                    metadata: {
                        membershipId: profile.membershipId,
                        mode: profile.mode,
                        fixedPayoutAmountMinor: profile.fixedPayoutAmountMinor,
                        payoutCurrency: profile.payoutCurrency,
                    },
                });
                return profile;
            }, {
                sessionContext: createDatabaseSessionContext(context),
            });
        },
        async updatePayoutProfile(context, current, input) {
            return database.transaction(async (transaction) => {
                const result = await transaction.query({
                    name: 'offers-payout-update-profile',
                    text: `
              with updated as (
                update public.member_payout_profiles
                set
                  mode = $3::public.payout_mode,
                  fixed_payout_amount_minor = $4,
                  payout_currency = $5,
                  updated_by = $6
                where id = $1
                  and company_id = $2
                  and date_trunc('milliseconds', updated_at) = $7::timestamptz
                returning *
              )
              select
                ${payoutProfileProjection('updated')}
              from updated
              inner join public.company_memberships as membership
                on membership.id = updated.membership_id
            `,
                    values: [
                        current.id,
                        current.companyId,
                        input.mode,
                        input.fixedPayoutAmountMinor,
                        input.payoutCurrency,
                        context.actorUserId,
                        current.updatedAt,
                    ],
                });
                const row = result.rows[0];
                if (row === undefined) {
                    return undefined;
                }
                const profile = mapPayoutProfileRow(row);
                await writeAuditEvent(transaction, {
                    companyId: current.companyId,
                    actorUserId: context.actorUserId,
                    requestId: context.requestId,
                    eventName: 'payout_profile.updated',
                    entityType: 'member_payout_profile',
                    entityId: profile.id,
                    metadata: {
                        membershipId: profile.membershipId,
                        previousMode: current.mode,
                        mode: profile.mode,
                        fixedPayoutAmountMinor: profile.fixedPayoutAmountMinor,
                        payoutCurrency: profile.payoutCurrency,
                    },
                });
                return profile;
            }, {
                sessionContext: createDatabaseSessionContext(context),
            });
        },
        async countOpenAssignmentsMissingManualPayout(context, companyId, membershipId) {
            return database.transaction(async (transaction) => {
                const result = await transaction.query({
                    name: 'offers-payout-count-incomplete-assignments',
                    text: `
              select count(*)::integer as count
              from public.offer_assignments
              where company_id = $1
                and membership_id = $2
                and status <> 'revoked'
                and (
                  manual_payout_amount_minor is null
                  or manual_payout_currency is null
                )
            `,
                    values: [companyId, membershipId],
                });
                const row = result.rows[0];
                if (row === undefined) {
                    throw new Error('The database did not return an assignment count.');
                }
                return normalizeInteger(row.count, 'count');
            }, {
                readOnly: true,
                sessionContext: createDatabaseSessionContext(context),
            });
        },
        async createAssignment(context, companyId, offerId, membershipId, input) {
            return database.transaction(async (transaction) => {
                const result = await transaction.query({
                    name: 'offers-payout-create-assignment',
                    text: `
              with inserted as (
                insert into public.offer_assignments (
                  company_id,
                  offer_id,
                  membership_id,
                  manager_membership_id,
                  status,
                  manual_payout_amount_minor,
                  manual_payout_currency,
                  assigned_by,
                  updated_by
                )
                values (
                  $1,
                  $2,
                  $3,
                  $4,
                  $5::public.offer_assignment_status,
                  $6,
                  $7,
                  $8,
                  $8
                )
                on conflict do nothing
                returning *
              )
              select
                ${assignmentProjection('inserted')}
              from inserted
              inner join public.offers as offer
                on offer.id = inserted.offer_id
              inner join public.company_memberships as membership
                on membership.id = inserted.membership_id
              inner join public.member_payout_profiles as profile
                on profile.membership_id = inserted.membership_id
            `,
                    values: [
                        companyId,
                        offerId,
                        membershipId,
                        input.managerMembershipId,
                        input.status,
                        input.manualPayoutAmountMinor,
                        input.manualPayoutCurrency,
                        context.actorUserId,
                    ],
                });
                const row = result.rows[0];
                if (row === undefined) {
                    return undefined;
                }
                const assignment = mapAssignmentRow(row);
                await writeAuditEvent(transaction, {
                    companyId,
                    actorUserId: context.actorUserId,
                    requestId: context.requestId,
                    eventName: 'offer_assignment.created',
                    entityType: 'offer_assignment',
                    entityId: assignment.id,
                    metadata: {
                        offerId: assignment.offerId,
                        membershipId: assignment.membershipId,
                        status: assignment.status,
                        payoutMode: assignment.payoutMode,
                        resolvedPayoutAmountMinor: assignment.resolvedPayoutAmountMinor,
                        resolvedPayoutCurrency: assignment.resolvedPayoutCurrency,
                    },
                });
                return assignment;
            }, {
                sessionContext: createDatabaseSessionContext(context),
            });
        },
        async listOfferAssignments(context, companyId, offerId, managerMembershipId) {
            return database.transaction(async (transaction) => {
                const values = [companyId, offerId];
                const conditions = ['assignment.company_id = $1', 'assignment.offer_id = $2'];
                if (managerMembershipId !== undefined) {
                    values.push(managerMembershipId);
                    conditions.push(`assignment.manager_membership_id = $${String(values.length)}::uuid`);
                    conditions.push(`membership.role = 'publisher'`);
                }
                const result = await transaction.query({
                    name: 'offers-payout-list-assignments',
                    text: `
              select
                ${assignmentProjection('assignment')}
              from public.offer_assignments as assignment
              inner join public.offers as offer
                on offer.id = assignment.offer_id
              inner join public.company_memberships as membership
                on membership.id = assignment.membership_id
              inner join public.member_payout_profiles as profile
                on profile.membership_id = assignment.membership_id
              where ${conditions.join('\n                and ')}
              order by assignment.created_at desc, assignment.id desc
            `,
                    values,
                });
                return Object.freeze(result.rows.map(mapAssignmentRow));
            }, {
                readOnly: true,
                sessionContext: createDatabaseSessionContext(context),
            });
        },
        async getAssignment(context, companyId, offerId, assignmentId, managerMembershipId) {
            return database.transaction(async (transaction) => {
                const values = [assignmentId, companyId, offerId];
                const conditions = [
                    'assignment.id = $1',
                    'assignment.company_id = $2',
                    'assignment.offer_id = $3',
                ];
                if (managerMembershipId !== undefined) {
                    values.push(managerMembershipId);
                    conditions.push(`assignment.manager_membership_id = $${String(values.length)}::uuid`);
                    conditions.push(`membership.role = 'publisher'`);
                }
                const result = await transaction.query({
                    name: 'offers-payout-get-assignment',
                    text: `
              select
                ${assignmentProjection('assignment')}
              from public.offer_assignments as assignment
              inner join public.offers as offer
                on offer.id = assignment.offer_id
              inner join public.company_memberships as membership
                on membership.id = assignment.membership_id
              inner join public.member_payout_profiles as profile
                on profile.membership_id = assignment.membership_id
              where ${conditions.join('\n                and ')}
              limit 1
            `,
                    values,
                });
                const row = result.rows[0];
                return row === undefined ? undefined : mapAssignmentRow(row);
            }, {
                readOnly: true,
                sessionContext: createDatabaseSessionContext(context),
            });
        },
        async updateAssignment(context, current, input) {
            return database.transaction(async (transaction) => {
                const result = await transaction.query({
                    name: 'offers-payout-update-assignment',
                    text: `
              with updated as (
                update public.offer_assignments
                set
                  status = $4::public.offer_assignment_status,
                  manual_payout_amount_minor = $5,
                  manual_payout_currency = $6,
                  updated_by = $7
                where id = $1
                  and company_id = $2
                  and offer_id = $3
                  and date_trunc('milliseconds', updated_at) = $8::timestamptz
                returning *
              )
              select
                ${assignmentProjection('updated')}
              from updated
              inner join public.offers as offer
                on offer.id = updated.offer_id
              inner join public.company_memberships as membership
                on membership.id = updated.membership_id
              inner join public.member_payout_profiles as profile
                on profile.membership_id = updated.membership_id
            `,
                    values: [
                        current.id,
                        current.companyId,
                        current.offerId,
                        input.status,
                        input.manualPayoutAmountMinor,
                        input.manualPayoutCurrency,
                        context.actorUserId,
                        current.updatedAt,
                    ],
                });
                const row = result.rows[0];
                if (row === undefined) {
                    return undefined;
                }
                const assignment = mapAssignmentRow(row);
                await writeAuditEvent(transaction, {
                    companyId: current.companyId,
                    actorUserId: context.actorUserId,
                    requestId: context.requestId,
                    eventName: 'offer_assignment.updated',
                    entityType: 'offer_assignment',
                    entityId: assignment.id,
                    metadata: {
                        offerId: assignment.offerId,
                        membershipId: assignment.membershipId,
                        previousStatus: current.status,
                        status: assignment.status,
                        payoutMode: assignment.payoutMode,
                        resolvedPayoutAmountMinor: assignment.resolvedPayoutAmountMinor,
                        resolvedPayoutCurrency: assignment.resolvedPayoutCurrency,
                    },
                });
                return assignment;
            }, {
                sessionContext: createDatabaseSessionContext(context),
            });
        },
    });
}
//# sourceMappingURL=offers-payout.repository.js.map