function createSessionContext(context) {
    return {
        actorUserId: context.actorUserId,
        requestId: context.requestId,
        ...(context.companyId !== undefined ? { companyId: context.companyId } : {}),
    };
}
function normalizeTimestamp(value, columnName) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error(`The database returned an invalid ${columnName} timestamp.`);
    }
    return date.toISOString();
}
function normalizeSafeInteger(value, columnName) {
    const normalizedValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isSafeInteger(normalizedValue)) {
        throw new Error(`The database returned an invalid ${columnName} value.`);
    }
    return normalizedValue;
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
function parseEndpointStatus(value) {
    switch (value) {
        case 'active':
        case 'paused':
        case 'archived':
            return value;
        default:
            throw new Error('The database returned an unsupported postback-endpoint status.');
    }
}
function parseConversionStatus(value) {
    switch (value) {
        case 'pending':
        case 'approved':
        case 'rejected':
        case 'reversed':
            return value;
        default:
            throw new Error('The database returned an unsupported conversion status.');
    }
}
function parseConversionSource(value) {
    if (value === 'provider_postback' || value === 'manual') {
        return value;
    }
    throw new Error('The database returned an unsupported conversion source.');
}
function parsePayoutMode(value) {
    if (value === 'fixed_member' || value === 'per_offer') {
        return value;
    }
    throw new Error('The database returned an unsupported payout mode.');
}
function mapCompanyRow(row) {
    return Object.freeze({
        id: row.id,
        status: parseCompanyStatus(row.status),
    });
}
function mapNetworkAccountRow(row) {
    return Object.freeze({
        id: row.id,
        companyId: row.company_id,
        name: row.name,
        status: parseNetworkAccountStatus(row.status),
    });
}
function mapEndpointRow(row) {
    return Object.freeze({
        id: row.id,
        companyId: row.company_id,
        networkAccountId: row.network_account_id,
        networkAccountName: row.network_account_name,
        name: row.name,
        endpointKeyLast4: row.endpoint_key_last4,
        status: parseEndpointStatus(row.status),
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        createdAt: normalizeTimestamp(row.created_at, 'created_at'),
        updatedAt: normalizeTimestamp(row.updated_at, 'updated_at'),
    });
}
function mapConversionRow(row) {
    return Object.freeze({
        id: row.id,
        publicConversionId: row.public_conversion_id,
        companyId: row.company_id,
        trackingClickId: row.tracking_click_id,
        publicClickId: row.public_click_id,
        trackingLinkId: row.tracking_link_id,
        offerId: row.offer_id,
        offerCode: row.offer_code,
        offerName: row.offer_name,
        networkAccountId: row.network_account_id,
        networkAccountName: row.network_account_name,
        ownerMembershipId: row.owner_membership_id,
        ownerUserId: row.owner_user_id,
        offerAssignmentId: row.offer_assignment_id,
        postbackEndpointId: row.postback_endpoint_id,
        postbackEndpointName: row.postback_endpoint_name,
        externalConversionId: row.external_conversion_id,
        source: parseConversionSource(row.source),
        status: parseConversionStatus(row.status),
        revenueAmountMinor: row.revenue_amount_minor === null
            ? null
            : normalizeSafeInteger(row.revenue_amount_minor, 'revenue_amount_minor'),
        revenueCurrency: row.revenue_currency,
        payoutMode: parsePayoutMode(row.payout_mode),
        payoutAmountMinor: normalizeSafeInteger(row.payout_amount_minor, 'payout_amount_minor'),
        payoutCurrency: row.payout_currency,
        convertedAt: normalizeTimestamp(row.converted_at, 'converted_at'),
        createdAt: normalizeTimestamp(row.created_at, 'created_at'),
        updatedAt: normalizeTimestamp(row.updated_at, 'updated_at'),
    });
}
function endpointProjection(alias) {
    return `
    ${alias}.id,
    ${alias}.company_id,
    ${alias}.network_account_id,
    account.name as network_account_name,
    ${alias}.name,
    ${alias}.endpoint_key_last4,
    ${alias}.status,
    ${alias}.created_by,
    ${alias}.updated_by,
    ${alias}.created_at,
    ${alias}.updated_at
  `;
}
function conversionProjection(alias) {
    return `
    ${alias}.id,
    ${alias}.public_conversion_id,
    ${alias}.company_id,
    ${alias}.tracking_click_id,
    ${alias}.public_click_id,
    ${alias}.tracking_link_id,
    ${alias}.offer_id,
    offer.code as offer_code,
    offer.name as offer_name,
    ${alias}.network_account_id,
    account.name as network_account_name,
    ${alias}.owner_membership_id,
    ${alias}.owner_user_id,
    ${alias}.offer_assignment_id,
    ${alias}.postback_endpoint_id,
    endpoint.name as postback_endpoint_name,
    ${alias}.external_conversion_id,
    ${alias}.source,
    ${alias}.status,
    ${alias}.revenue_amount_minor,
    ${alias}.revenue_currency,
    ${alias}.payout_mode,
    ${alias}.payout_amount_minor,
    ${alias}.payout_currency,
    ${alias}.converted_at,
    ${alias}.created_at,
    ${alias}.updated_at
  `;
}
async function writeAuditEvent(transaction, input) {
    await transaction.query({
        name: 'conversion-postbacks-write-audit-event',
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
      values ($1, $2, $3, $4, $5, $6, $7::jsonb)
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
export function createConversionPostbacksRepository(database) {
    return Object.freeze({
        async getCompany(context, companyId) {
            return database.transaction(async (transaction) => {
                const result = await transaction.query({
                    name: 'conversion-postbacks-get-company',
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
                sessionContext: createSessionContext(context),
            });
        },
        async getNetworkAccount(context, companyId, networkAccountId) {
            return database.transaction(async (transaction) => {
                const result = await transaction.query({
                    name: 'conversion-postbacks-get-network-account',
                    text: `
              select id, company_id, name, status
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
                sessionContext: createSessionContext(context),
            });
        },
        async createEndpoint(context, companyId, networkAccountId, input) {
            return database.transaction(async (transaction) => {
                const result = await transaction.query({
                    name: 'conversion-postbacks-create-endpoint',
                    text: `
              with inserted as (
                insert into public.network_postback_endpoints (
                  company_id,
                  network_account_id,
                  name,
                  endpoint_key_hash,
                  endpoint_key_last4,
                  status,
                  created_by,
                  updated_by
                )
                values ($1, $2, $3, $4, $5, $6::public.network_postback_endpoint_status, $7, $7)
                on conflict do nothing
                returning *
              )
              select
                ${endpointProjection('inserted')}
              from inserted
              inner join public.network_accounts as account
                on account.id = inserted.network_account_id
            `,
                    values: [
                        companyId,
                        networkAccountId,
                        input.name,
                        input.endpointKeyHash,
                        input.endpointKeyLast4,
                        input.status,
                        context.actorUserId,
                    ],
                });
                const row = result.rows[0];
                if (row === undefined) {
                    return undefined;
                }
                const endpoint = mapEndpointRow(row);
                await writeAuditEvent(transaction, {
                    companyId,
                    actorUserId: context.actorUserId,
                    requestId: context.requestId,
                    eventName: 'network_postback_endpoint.created',
                    entityType: 'network_postback_endpoint',
                    entityId: endpoint.id,
                    metadata: {
                        networkAccountId,
                        name: endpoint.name,
                        endpointKeyLast4: endpoint.endpointKeyLast4,
                        status: endpoint.status,
                    },
                });
                return endpoint;
            }, {
                sessionContext: createSessionContext(context),
            });
        },
        async listEndpoints(context, companyId, networkAccountId, input) {
            return database.transaction(async (transaction) => {
                const values = [companyId, networkAccountId];
                const conditions = ['endpoint.company_id = $1', 'endpoint.network_account_id = $2'];
                if (input.status !== undefined) {
                    values.push(input.status);
                    conditions.push(`endpoint.status = $${String(values.length)}::public.network_postback_endpoint_status`);
                }
                const result = await transaction.query({
                    name: 'conversion-postbacks-list-endpoints',
                    text: `
              select
                ${endpointProjection('endpoint')}
              from public.network_postback_endpoints as endpoint
              inner join public.network_accounts as account
                on account.id = endpoint.network_account_id
              where ${conditions.join('\n                and ')}
              order by endpoint.created_at desc, endpoint.id desc
            `,
                    values,
                });
                return Object.freeze(result.rows.map(mapEndpointRow));
            }, {
                readOnly: true,
                sessionContext: createSessionContext(context),
            });
        },
        async getEndpoint(context, companyId, networkAccountId, endpointId) {
            return database.transaction(async (transaction) => {
                const result = await transaction.query({
                    name: 'conversion-postbacks-get-endpoint',
                    text: `
              select
                ${endpointProjection('endpoint')}
              from public.network_postback_endpoints as endpoint
              inner join public.network_accounts as account
                on account.id = endpoint.network_account_id
              where endpoint.id = $1
                and endpoint.company_id = $2
                and endpoint.network_account_id = $3
              limit 1
            `,
                    values: [endpointId, companyId, networkAccountId],
                });
                const row = result.rows[0];
                return row === undefined ? undefined : mapEndpointRow(row);
            }, {
                readOnly: true,
                sessionContext: createSessionContext(context),
            });
        },
        async updateEndpoint(context, current, input, auditEventName) {
            return database.transaction(async (transaction) => {
                const result = await transaction.query({
                    name: 'conversion-postbacks-update-endpoint',
                    text: `
              with updated as (
                update public.network_postback_endpoints
                set
                  name = $4,
                  endpoint_key_hash = coalesce($5, endpoint_key_hash),
                  endpoint_key_last4 = coalesce($6, endpoint_key_last4),
                  status = $7::public.network_postback_endpoint_status,
                  updated_by = $8
                where id = $1
                  and company_id = $2
                  and network_account_id = $3
                  and date_trunc('milliseconds', updated_at) = $9::timestamptz
                returning *
              )
              select
                ${endpointProjection('updated')}
              from updated
              inner join public.network_accounts as account
                on account.id = updated.network_account_id
            `,
                    values: [
                        current.id,
                        current.companyId,
                        current.networkAccountId,
                        input.name,
                        input.endpointKeyHash,
                        input.endpointKeyLast4,
                        input.status,
                        context.actorUserId,
                        current.updatedAt,
                    ],
                });
                const row = result.rows[0];
                if (row === undefined) {
                    return undefined;
                }
                const endpoint = mapEndpointRow(row);
                await writeAuditEvent(transaction, {
                    companyId: endpoint.companyId,
                    actorUserId: context.actorUserId,
                    requestId: context.requestId,
                    eventName: auditEventName,
                    entityType: 'network_postback_endpoint',
                    entityId: endpoint.id,
                    metadata: {
                        networkAccountId: endpoint.networkAccountId,
                        name: endpoint.name,
                        endpointKeyLast4: endpoint.endpointKeyLast4,
                        status: endpoint.status,
                    },
                });
                return endpoint;
            }, {
                sessionContext: createSessionContext(context),
            });
        },
        async listConversions(context, companyId, input) {
            return database.transaction(async (transaction) => {
                const values = [companyId];
                const conditions = ['conversion.company_id = $1'];
                const addCondition = (value, expression) => {
                    values.push(value);
                    conditions.push(expression(values.length));
                };
                if (input.networkAccountId !== undefined) {
                    addCondition(input.networkAccountId, (index) => `conversion.network_account_id = $${String(index)}`);
                }
                if (input.offerId !== undefined) {
                    addCondition(input.offerId, (index) => `conversion.offer_id = $${String(index)}`);
                }
                if (input.ownerMembershipId !== undefined) {
                    addCondition(input.ownerMembershipId, (index) => `conversion.owner_membership_id = $${String(index)}`);
                }
                if (input.status !== undefined) {
                    addCondition(input.status, (index) => `conversion.status = $${String(index)}::public.conversion_status`);
                }
                if (input.visibleToUserId !== undefined) {
                    addCondition(input.visibleToUserId, (index) => `conversion.owner_user_id = $${String(index)}`);
                }
                values.push(input.limit);
                const limitIndex = values.length;
                const result = await transaction.query({
                    name: 'conversion-postbacks-list-conversions',
                    text: `
              select
                ${conversionProjection('conversion')}
              from public.conversions as conversion
              inner join public.offers as offer
                on offer.id = conversion.offer_id
              inner join public.network_accounts as account
                on account.id = conversion.network_account_id
              left join public.network_postback_endpoints as endpoint
                on endpoint.id = conversion.postback_endpoint_id
              where ${conditions.join('\n                and ')}
              order by conversion.converted_at desc, conversion.id desc
              limit $${String(limitIndex)}
            `,
                    values,
                });
                return Object.freeze(result.rows.map(mapConversionRow));
            }, {
                readOnly: true,
                sessionContext: createSessionContext(context),
            });
        },
        async getConversion(context, companyId, conversionId, visibleToUserId) {
            return database.transaction(async (transaction) => {
                const values = [conversionId, companyId];
                const visibilityCondition = visibleToUserId === undefined
                    ? ''
                    : (() => {
                        values.push(visibleToUserId);
                        return `and conversion.owner_user_id = $${String(values.length)}`;
                    })();
                const result = await transaction.query({
                    name: 'conversion-postbacks-get-conversion',
                    text: `
              select
                ${conversionProjection('conversion')}
              from public.conversions as conversion
              inner join public.offers as offer
                on offer.id = conversion.offer_id
              inner join public.network_accounts as account
                on account.id = conversion.network_account_id
              left join public.network_postback_endpoints as endpoint
                on endpoint.id = conversion.postback_endpoint_id
              where conversion.id = $1
                and conversion.company_id = $2
                ${visibilityCondition}
              limit 1
            `,
                    values,
                });
                const row = result.rows[0];
                return row === undefined ? undefined : mapConversionRow(row);
            }, {
                readOnly: true,
                sessionContext: createSessionContext(context),
            });
        },
    });
}
//# sourceMappingURL=conversion-postbacks.repository.js.map