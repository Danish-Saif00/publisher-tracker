function normalizeTimestamp(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new Error('The database returned an invalid timestamp.');
    }
    return date.toISOString();
}
function normalizeOptionalTimestamp(value) {
    return value === null ? null : normalizeTimestamp(value);
}
function parsePlanStatus(value) {
    switch (value) {
        case 'active':
        case 'archived':
            return value;
        default:
            throw new Error('The database returned an unsupported billing plan status.');
    }
}
function parseBillingInterval(value) {
    switch (value) {
        case 'monthly':
        case 'annual':
            return value;
        default:
            throw new Error('The database returned an unsupported billing interval.');
    }
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
function parseSubscriptionStatus(value) {
    switch (value) {
        case 'trialing':
        case 'active':
        case 'grace_period':
        case 'suspended':
        case 'canceled':
        case 'expired':
            return value;
        default:
            throw new Error('The database returned an unsupported company subscription status.');
    }
}
function mapEntitlementRow(row) {
    return Object.freeze({
        id: row.id,
        planId: row.plan_id,
        key: row.entitlement_key,
        enabled: row.enabled,
        limitValue: row.limit_value,
        createdAt: normalizeTimestamp(row.created_at),
        updatedAt: normalizeTimestamp(row.updated_at),
    });
}
function mapPlanRow(row, entitlements) {
    return Object.freeze({
        id: row.id,
        code: row.code,
        name: row.name,
        description: row.description,
        status: parsePlanStatus(row.status),
        currency: row.currency,
        priceAmountMinor: row.price_amount_minor,
        billingInterval: parseBillingInterval(row.billing_interval),
        trialDays: row.trial_days,
        gracePeriodDays: row.grace_period_days,
        createdBy: row.created_by,
        createdAt: normalizeTimestamp(row.created_at),
        updatedAt: normalizeTimestamp(row.updated_at),
        entitlements: Object.freeze([...entitlements]),
    });
}
function mapCompanyRow(row) {
    return Object.freeze({
        id: row.id,
        status: parseCompanyStatus(row.status),
    });
}
function mapSubscriptionRow(row) {
    return Object.freeze({
        id: row.id,
        companyId: row.company_id,
        planId: row.plan_id,
        status: parseSubscriptionStatus(row.status),
        startsAt: normalizeTimestamp(row.starts_at),
        trialEndsAt: normalizeOptionalTimestamp(row.trial_ends_at),
        currentPeriodStartsAt: normalizeTimestamp(row.current_period_starts_at),
        currentPeriodEndsAt: normalizeOptionalTimestamp(row.current_period_ends_at),
        graceEndsAt: normalizeOptionalTimestamp(row.grace_ends_at),
        canceledAt: normalizeOptionalTimestamp(row.canceled_at),
        endedAt: normalizeOptionalTimestamp(row.ended_at),
        externalReference: row.external_reference,
        createdBy: row.created_by,
        updatedBy: row.updated_by,
        createdAt: normalizeTimestamp(row.created_at),
        updatedAt: normalizeTimestamp(row.updated_at),
    });
}
function createDatabaseSessionContext(context) {
    return {
        actorUserId: context.actorUserId,
        requestId: context.requestId,
        ...(context.companyId !== undefined
            ? {
                companyId: context.companyId,
            }
            : {}),
    };
}
async function writeAuditEvent(transaction, input) {
    await transaction.query({
        name: 'billing-foundation-write-audit-event',
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
async function insertEntitlements(transaction, planId, entitlements) {
    for (const entitlement of entitlements) {
        await transaction.query({
            name: 'billing-foundation-insert-plan-entitlement',
            text: `
        insert into public.billing_plan_entitlements (
          plan_id,
          entitlement_key,
          enabled,
          limit_value
        )
        values (
          $1,
          $2,
          $3,
          $4
        )
      `,
            values: [planId, entitlement.key, entitlement.enabled, entitlement.limitValue],
        });
    }
}
async function loadEntitlements(transaction, planIds) {
    if (planIds.length === 0) {
        return Object.freeze([]);
    }
    const result = await transaction.query({
        name: 'billing-foundation-load-plan-entitlements',
        text: `
      select
        id,
        plan_id,
        entitlement_key,
        enabled,
        limit_value,
        created_at,
        updated_at
      from public.billing_plan_entitlements
      where plan_id = any($1::uuid[])
      order by plan_id asc, entitlement_key asc, id asc
    `,
        values: [planIds],
    });
    return Object.freeze(result.rows.map(mapEntitlementRow));
}
function attachEntitlements(rows, entitlements) {
    const entitlementsByPlan = new Map();
    for (const entitlement of entitlements) {
        const current = entitlementsByPlan.get(entitlement.planId);
        if (current === undefined) {
            entitlementsByPlan.set(entitlement.planId, [entitlement]);
        }
        else {
            current.push(entitlement);
        }
    }
    return Object.freeze(rows.map((row) => mapPlanRow(row, entitlementsByPlan.get(row.id) ?? [])));
}
async function getPlanWithinTransaction(transaction, planId) {
    const result = await transaction.query({
        name: 'billing-foundation-get-plan',
        text: `
      select
        id,
        code,
        name,
        description,
        status,
        currency,
        price_amount_minor,
        billing_interval,
        trial_days,
        grace_period_days,
        created_by,
        created_at,
        updated_at
      from public.billing_plans
      where id = $1
      limit 1
    `,
        values: [planId],
    });
    const row = result.rows[0];
    if (row === undefined) {
        return undefined;
    }
    const entitlements = await loadEntitlements(transaction, [planId]);
    return mapPlanRow(row, entitlements);
}
export function createBillingFoundationRepository(database) {
    return Object.freeze({
        async createPlan(context, input) {
            return database.transaction(async (transaction) => {
                const result = await transaction.query({
                    name: 'billing-foundation-create-plan',
                    text: `
              insert into public.billing_plans (
                code,
                name,
                description,
                status,
                currency,
                price_amount_minor,
                billing_interval,
                trial_days,
                grace_period_days,
                created_by
              )
              values (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                $10
              )
              on conflict (code) do nothing
              returning
                id,
                code,
                name,
                description,
                status,
                currency,
                price_amount_minor,
                billing_interval,
                trial_days,
                grace_period_days,
                created_by,
                created_at,
                updated_at
            `,
                    values: [
                        input.code,
                        input.name,
                        input.description,
                        input.status,
                        input.currency,
                        input.priceAmountMinor,
                        input.billingInterval,
                        input.trialDays,
                        input.gracePeriodDays,
                        context.actorUserId,
                    ],
                });
                const row = result.rows[0];
                if (row === undefined) {
                    return undefined;
                }
                await insertEntitlements(transaction, row.id, input.entitlements);
                const plan = await getPlanWithinTransaction(transaction, row.id);
                if (plan === undefined) {
                    throw new Error('The created billing plan could not be reloaded.');
                }
                await writeAuditEvent(transaction, {
                    companyId: null,
                    actorUserId: context.actorUserId,
                    requestId: context.requestId,
                    eventName: 'billing.plan.created',
                    entityType: 'billing_plan',
                    entityId: plan.id,
                    metadata: {
                        code: plan.code,
                        status: plan.status,
                        currency: plan.currency,
                        priceAmountMinor: plan.priceAmountMinor,
                        billingInterval: plan.billingInterval,
                        entitlementCount: plan.entitlements.length,
                    },
                });
                return plan;
            }, {
                sessionContext: createDatabaseSessionContext(context),
            });
        },
        async listPlans(context, status) {
            return database.transaction(async (transaction) => {
                const result = await transaction.query({
                    name: 'billing-foundation-list-plans',
                    text: `
              select
                id,
                code,
                name,
                description,
                status,
                currency,
                price_amount_minor,
                billing_interval,
                trial_days,
                grace_period_days,
                created_by,
                created_at,
                updated_at
              from public.billing_plans
              where (
                $1::public.billing_plan_status is null
                or status = $1::public.billing_plan_status
              )
              order by created_at desc, id desc
            `,
                    values: [status ?? null],
                });
                const entitlements = await loadEntitlements(transaction, result.rows.map((row) => row.id));
                return attachEntitlements(result.rows, entitlements);
            }, {
                readOnly: true,
                sessionContext: createDatabaseSessionContext(context),
            });
        },
        async getPlan(context, planId) {
            return database.transaction(async (transaction) => getPlanWithinTransaction(transaction, planId), {
                readOnly: true,
                sessionContext: createDatabaseSessionContext(context),
            });
        },
        async updatePlan(context, planId, expectedUpdatedAt, previousStatus, input) {
            return database.transaction(async (transaction) => {
                const result = await transaction.query({
                    name: 'billing-foundation-update-plan',
                    text: `
              update public.billing_plans
              set
                name = case
                  when $3::boolean then $4::text
                  else name
                end,
                description = case
                  when $5::boolean then $6::text
                  else description
                end,
                status = case
                  when $7::boolean then $8::public.billing_plan_status
                  else status
                end,
                currency = case
                  when $9::boolean then $10::text
                  else currency
                end,
                price_amount_minor = case
                  when $11::boolean then $12::integer
                  else price_amount_minor
                end,
                billing_interval = case
                  when $13::boolean then $14::public.billing_interval
                  else billing_interval
                end,
                trial_days = case
                  when $15::boolean then $16::integer
                  else trial_days
                end,
                grace_period_days = case
                  when $17::boolean then $18::integer
                  else grace_period_days
                end
              where id = $1
                and updated_at = $2::timestamptz
              returning
                id,
                code,
                name,
                description,
                status,
                currency,
                price_amount_minor,
                billing_interval,
                trial_days,
                grace_period_days,
                created_by,
                created_at,
                updated_at
            `,
                    values: [
                        planId,
                        expectedUpdatedAt,
                        input.name !== undefined,
                        input.name ?? null,
                        input.description !== undefined,
                        input.description ?? null,
                        input.status !== undefined,
                        input.status ?? null,
                        input.currency !== undefined,
                        input.currency ?? null,
                        input.priceAmountMinor !== undefined,
                        input.priceAmountMinor ?? null,
                        input.billingInterval !== undefined,
                        input.billingInterval ?? null,
                        input.trialDays !== undefined,
                        input.trialDays ?? null,
                        input.gracePeriodDays !== undefined,
                        input.gracePeriodDays ?? null,
                    ],
                });
                const row = result.rows[0];
                if (row === undefined) {
                    return undefined;
                }
                if (input.entitlements !== undefined) {
                    await transaction.query({
                        name: 'billing-foundation-delete-plan-entitlements',
                        text: `
                delete from public.billing_plan_entitlements
                where plan_id = $1
              `,
                        values: [planId],
                    });
                    await insertEntitlements(transaction, planId, input.entitlements);
                }
                const plan = await getPlanWithinTransaction(transaction, planId);
                if (plan === undefined) {
                    throw new Error('The updated billing plan could not be reloaded.');
                }
                await writeAuditEvent(transaction, {
                    companyId: null,
                    actorUserId: context.actorUserId,
                    requestId: context.requestId,
                    eventName: 'billing.plan.updated',
                    entityType: 'billing_plan',
                    entityId: plan.id,
                    metadata: {
                        previousStatus,
                        status: plan.status,
                        changedFields: input.changedFields,
                        entitlementCount: plan.entitlements.length,
                    },
                });
                return plan;
            }, {
                sessionContext: createDatabaseSessionContext(context),
            });
        },
        async countOpenSubscriptionsForPlan(context, planId) {
            return database.transaction(async (transaction) => {
                const result = await transaction.query({
                    name: 'billing-foundation-count-open-plan-subscriptions',
                    text: `
              select count(*)::text as count
              from public.company_subscriptions
              where plan_id = $1
                and status not in (
                  'canceled',
                  'expired'
                )
            `,
                    values: [planId],
                });
                const count = Number(result.rows[0]?.count ?? '0');
                if (!Number.isSafeInteger(count) || count < 0) {
                    throw new Error('The database returned an invalid subscription count.');
                }
                return count;
            }, {
                readOnly: true,
                sessionContext: createDatabaseSessionContext(context),
            });
        },
        async getCompany(context, companyId) {
            return database.transaction(async (transaction) => {
                const result = await transaction.query({
                    name: 'billing-foundation-get-company',
                    text: `
              select
                id,
                status
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
        async getCompanySubscription(context, companyId) {
            return database.transaction(async (transaction) => {
                const result = await transaction.query({
                    name: 'billing-foundation-get-company-subscription',
                    text: `
              select
                id,
                company_id,
                plan_id,
                status,
                starts_at,
                trial_ends_at,
                current_period_starts_at,
                current_period_ends_at,
                grace_ends_at,
                canceled_at,
                ended_at,
                external_reference,
                created_by,
                updated_by,
                created_at,
                updated_at
              from public.company_subscriptions
              where company_id = $1
              limit 1
            `,
                    values: [companyId],
                });
                const row = result.rows[0];
                return row === undefined ? undefined : mapSubscriptionRow(row);
            }, {
                readOnly: true,
                sessionContext: createDatabaseSessionContext(context),
            });
        },
        async createCompanySubscription(context, companyId, input) {
            return database.transaction(async (transaction) => {
                const result = await transaction.query({
                    name: 'billing-foundation-create-company-subscription',
                    text: `
              insert into public.company_subscriptions (
                company_id,
                plan_id,
                status,
                starts_at,
                trial_ends_at,
                current_period_starts_at,
                current_period_ends_at,
                grace_ends_at,
                canceled_at,
                ended_at,
                external_reference,
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
                $8,
                $9,
                $10,
                $11,
                $12,
                $12
              )
              on conflict (company_id) do nothing
              returning
                id,
                company_id,
                plan_id,
                status,
                starts_at,
                trial_ends_at,
                current_period_starts_at,
                current_period_ends_at,
                grace_ends_at,
                canceled_at,
                ended_at,
                external_reference,
                created_by,
                updated_by,
                created_at,
                updated_at
            `,
                    values: [
                        companyId,
                        input.planId,
                        input.status,
                        input.startsAt,
                        input.trialEndsAt,
                        input.currentPeriodStartsAt,
                        input.currentPeriodEndsAt,
                        input.graceEndsAt,
                        input.canceledAt,
                        input.endedAt,
                        input.externalReference,
                        context.actorUserId,
                    ],
                });
                const row = result.rows[0];
                if (row === undefined) {
                    return undefined;
                }
                const subscription = mapSubscriptionRow(row);
                await writeAuditEvent(transaction, {
                    companyId,
                    actorUserId: context.actorUserId,
                    requestId: context.requestId,
                    eventName: 'billing.subscription.created',
                    entityType: 'company_subscription',
                    entityId: subscription.id,
                    metadata: {
                        planId: subscription.planId,
                        status: subscription.status,
                        startsAt: subscription.startsAt,
                        trialEndsAt: subscription.trialEndsAt,
                        currentPeriodEndsAt: subscription.currentPeriodEndsAt,
                    },
                });
                return subscription;
            }, {
                sessionContext: createDatabaseSessionContext(context),
            });
        },
        async updateCompanySubscription(context, companyId, expectedUpdatedAt, previousStatus, previousPlanId, input) {
            return database.transaction(async (transaction) => {
                const result = await transaction.query({
                    name: 'billing-foundation-update-company-subscription',
                    text: `
              update public.company_subscriptions
              set
                plan_id = $3,
                status = $4,
                starts_at = $5,
                trial_ends_at = $6,
                current_period_starts_at = $7,
                current_period_ends_at = $8,
                grace_ends_at = $9,
                canceled_at = $10,
                ended_at = $11,
                external_reference = $12,
                updated_by = $13
              where company_id = $1
                and updated_at = $2::timestamptz
              returning
                id,
                company_id,
                plan_id,
                status,
                starts_at,
                trial_ends_at,
                current_period_starts_at,
                current_period_ends_at,
                grace_ends_at,
                canceled_at,
                ended_at,
                external_reference,
                created_by,
                updated_by,
                created_at,
                updated_at
            `,
                    values: [
                        companyId,
                        expectedUpdatedAt,
                        input.planId,
                        input.status,
                        input.startsAt,
                        input.trialEndsAt,
                        input.currentPeriodStartsAt,
                        input.currentPeriodEndsAt,
                        input.graceEndsAt,
                        input.canceledAt,
                        input.endedAt,
                        input.externalReference,
                        context.actorUserId,
                    ],
                });
                const row = result.rows[0];
                if (row === undefined) {
                    return undefined;
                }
                const subscription = mapSubscriptionRow(row);
                await writeAuditEvent(transaction, {
                    companyId,
                    actorUserId: context.actorUserId,
                    requestId: context.requestId,
                    eventName: 'billing.subscription.updated',
                    entityType: 'company_subscription',
                    entityId: subscription.id,
                    metadata: {
                        previousPlanId,
                        planId: subscription.planId,
                        previousStatus,
                        status: subscription.status,
                        currentPeriodEndsAt: subscription.currentPeriodEndsAt,
                        graceEndsAt: subscription.graceEndsAt,
                        externalReference: subscription.externalReference,
                    },
                });
                return subscription;
            }, {
                sessionContext: createDatabaseSessionContext(context),
            });
        },
    });
}
//# sourceMappingURL=billing-foundation.repository.js.map