import { useState, type FormEvent } from 'react';

import { MaterialIcon } from '../../components/icons/material-icon';
import { GlassPanel } from '../../components/ui/glass-panel';
import { useBilling } from '../../features/control-plane/use-control-plane';
import { useBillingInvoices } from '../../features/final-operations/use-final-operations';
import type {
  BillingInterval,
  BillingPlanStatus,
  CompanySubscriptionStatus,
} from '../../features/control-plane/control-plane.types';
import {
  formatDateTime,
  formatLabel,
  formatMinorAmount,
  parseMajorAmountToMinor,
} from '../control-plane/control-plane-formatters';
import {
  ControlAccessDenied,
  ControlCardHeading,
  ControlEmpty,
  ControlFeedback,
  ControlLoading,
  ControlModuleHeader,
  ControlStatus,
  RefreshButton,
} from '../control-plane/control-plane-ui';

function optionalText(value: FormDataEntryValue | null): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized.length === 0 ? undefined : normalized;
}

function optionalDate(value: FormDataEntryValue | null): string | undefined {
  const normalized = optionalText(value);

  if (normalized === undefined) {
    return undefined;
  }

  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Enter a valid billing date.');
  }

  return date.toISOString();
}

function formatRemainingAccess(value: string | null): string {
  if (value === null) {
    return 'No fixed end date';
  }

  const remainingMilliseconds =
    new Date(value).getTime() - Date.now();

  if (!Number.isFinite(remainingMilliseconds)) {
    return 'End date unavailable';
  }

  if (remainingMilliseconds <= 0) {
    return 'Period ended';
  }

  const remainingDays = Math.ceil(
    remainingMilliseconds / 86_400_000,
  );

  return remainingDays === 1
    ? '1 day remaining'
    : `${remainingDays} days remaining`;
}

export function BillingPage() {
  const billing = useBilling();
  const invoices = useBillingInvoices();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (billing.status === 'loading' || billing.status === 'idle') {
    return <ControlLoading label="billing" />;
  }

  if (billing.status === 'forbidden') {
    return (
      <ControlAccessDenied
        message="Your account cannot view billing for the selected company."
        title="Billing access restricted"
      />
    );
  }

  const subscription = billing.snapshot?.subscription ?? null;
  const activePlan = billing.snapshot?.plan ?? null;
  const accessDeadline =
    subscription?.status === 'trialing'
      ? subscription.trialEndsAt
      : subscription?.status === 'grace_period'
        ? subscription.graceEndsAt
        : subscription?.currentPeriodEndsAt ?? null;

  async function handleCreatePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setActionError(null);

    try {
      const form = event.currentTarget;
      const data = new FormData(form);
      const currency = String(data.get('currency') ?? 'USD').trim().toUpperCase();
      const priceAmountMinor = parseMajorAmountToMinor(
        String(data.get('price') ?? ''),
        currency,
      );

      if (priceAmountMinor === null) {
        throw new Error('Plan price is required.');
      }

      const plan = await billing.createPlan({
        code: String(data.get('code') ?? ''),
        name: String(data.get('name') ?? ''),
        description: optionalText(data.get('description')),
        currency,
        priceAmountMinor,
        billingInterval: String(data.get('billingInterval')) as BillingInterval,
        trialDays: Number(data.get('trialDays') ?? 0),
        gracePeriodDays: Number(data.get('gracePeriodDays') ?? 0),
      });

      form.reset();
      setFeedback(`${plan.name} was added to the billing catalog.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Billing plan creation failed.');
    }
  }

  async function handlePlanStatus(planId: string, status: BillingPlanStatus) {
    setFeedback(null);
    setActionError(null);

    try {
      const plan = await billing.updatePlan({ planId, status });
      setFeedback(`${plan.name} is now ${formatLabel(plan.status).toLowerCase()}.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Billing plan update failed.');
    }
  }

  async function handleCreateSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setActionError(null);

    try {
      const data = new FormData(event.currentTarget);
      const snapshot = await billing.createSubscription({
        planId: String(data.get('planId') ?? ''),
        startsAt: optionalDate(data.get('startsAt')),
        currentPeriodEndsAt: optionalDate(data.get('currentPeriodEndsAt')),
        externalReference: optionalText(data.get('externalReference')),
      });
      setFeedback(
        `${snapshot.plan?.name ?? 'The selected plan'} is now assigned to ${billing.companyName}.`,
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Subscription creation failed.');
    }
  }

  async function handleSubscriptionStatus(status: CompanySubscriptionStatus) {
    setFeedback(null);
    setActionError(null);

    try {
      const snapshot = await billing.updateSubscription({ status });
      setFeedback(
        `Company subscription is now ${formatLabel(snapshot.subscription?.status ?? status).toLowerCase()}.`,
      );
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Subscription update failed.');
    }
  }

  return (
    <div className="control-page">
      <ControlModuleHeader
        description={
          <>
            Manage plan access and manual subscriptions for <strong>{billing.companyName}</strong>.
          </>
        }
        eyebrow="SaaS Access"
        icon="payments"
        stats={[
          { label: 'Plan', value: activePlan?.name ?? 'Unassigned' },
          { label: 'Status', value: subscription ? formatLabel(subscription.status) : 'None' },
          {
            label: 'Access',
            value: billing.snapshot?.access.allowed
              ? formatRemainingAccess(accessDeadline)
              : 'Restricted',
          },
        ]}
        title="Billing"
      />

      <ControlFeedback
        error={actionError ?? billing.error ?? invoices.error}
        message={feedback}
      />

      <div className="billing-plan-showcase">
        <GlassPanel
          as="article"
          className="billing-plan-card billing-plan-card--current"
        >
          <span className="billing-plan-card__eyebrow">Current plan</span>
          <MaterialIcon name="workspace_premium" />
          <strong>{activePlan?.name ?? 'No plan assigned'}</strong>
          <span>
            {activePlan === null
              ? 'A Platform Super Admin must assign a billing plan.'
              : formatMinorAmount(
                  activePlan.priceAmountMinor,
                  activePlan.currency,
                )}
          </span>
          <ControlStatus
            status={subscription?.status ?? 'unassigned'}
          />
        </GlassPanel>

        <GlassPanel
          as="article"
          className="billing-plan-card"
        >
          <span className="billing-plan-card__eyebrow">Access period</span>
          <MaterialIcon name="schedule" />
          <strong>{formatRemainingAccess(accessDeadline)}</strong>
          <span>
            {accessDeadline === null
              ? 'No trial or billing-period end is currently configured.'
              : `Ends ${formatDateTime(accessDeadline)}`}
          </span>
          <ControlStatus
            status={
              billing.snapshot?.access.allowed
                ? 'active'
                : 'restricted'
            }
          />
        </GlassPanel>
      </div>

      <div className="control-layout-grid">
        {billing.permissions.canManagePlatform && (
          <GlassPanel as="section" className="control-side-card">
            <ControlCardHeading
              description="Create a reusable manual subscription plan."
              eyebrow="Plan Catalog"
              title="Add billing plan"
            />
            <form className="control-form" onSubmit={(event) => void handleCreatePlan(event)}>
              <label><span>Plan code</span><input name="code" placeholder="growth_monthly" required /></label>
              <label><span>Plan name</span><input name="name" placeholder="Growth" required /></label>
              <label><span>Description</span><textarea name="description" placeholder="For growing publisher teams" rows={3} /></label>
              <div className="control-form-grid">
                <label><span>Currency</span><input defaultValue="USD" maxLength={3} name="currency" required /></label>
                <label><span>Price</span><input min="0" name="price" placeholder="99.00" required step="0.01" type="number" /></label>
              </div>
              <label>
                <span>Billing interval</span>
                <select defaultValue="monthly" name="billingInterval">
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual</option>
                </select>
              </label>
              <div className="control-form-grid">
                <label><span>Trial days</span><input defaultValue="0" min="0" name="trialDays" type="number" /></label>
                <label><span>Grace days</span><input defaultValue="0" min="0" name="gracePeriodDays" type="number" /></label>
              </div>
              <button className="primary-gradient-button" disabled={billing.isMutating} type="submit">
                <MaterialIcon name="add_card" /> Add plan
              </button>
            </form>
          </GlassPanel>
        )}

        <GlassPanel as="section" className={`control-main-card ${billing.permissions.canManagePlatform ? '' : 'control-main-card--full'}`}>
          <ControlCardHeading
            action={<RefreshButton disabled={billing.isMutating} onClick={() => void billing.refresh()} />}
            description="Current entitlement and billing-period status."
            eyebrow="Company Subscription"
            title={billing.companyName}
          />

          {billing.snapshot === null ? (
            <ControlEmpty icon="credit_card_off" message="No billing snapshot is available for this company." title="Billing not configured" />
          ) : (
            <>
              <div className="control-meta-grid control-meta-grid--three">
                <div><span>Company status</span><ControlStatus status={billing.snapshot.companyStatus} /></div>
                <div><span>Access reason</span><strong>{formatLabel(billing.snapshot.access.reason)}</strong></div>
                <div><span>Effective until</span><strong>{formatDateTime(billing.snapshot.access.effectiveUntil)}</strong></div>
              </div>

              {subscription === null ? (
                billing.permissions.canManagePlatform ? (
                  <form className="control-form control-form--inline-card" onSubmit={(event) => void handleCreateSubscription(event)}>
                    <label>
                      <span>Plan</span>
                      <select name="planId" required>
                        <option value="">Select plan</option>
                        {billing.plans.filter((plan) => plan.status === 'active').map((plan) => (
                          <option key={plan.id} value={plan.id}>{plan.name} · {formatMinorAmount(plan.priceAmountMinor, plan.currency)}</option>
                        ))}
                      </select>
                    </label>
                    <div className="control-form-grid">
                      <label><span>Starts at</span><input name="startsAt" type="datetime-local" /></label>
                      <label><span>Period ends</span><input name="currentPeriodEndsAt" type="datetime-local" /></label>
                    </div>
                    <label><span>External reference</span><input name="externalReference" placeholder="Optional invoice or contract reference" /></label>
                    <button className="primary-gradient-button" disabled={billing.isMutating || billing.plans.length === 0} type="submit">
                      <MaterialIcon name="assignment_turned_in" /> Assign plan
                    </button>
                  </form>
                ) : (
                  <ControlEmpty icon="hourglass_empty" message="A Platform Super Admin must assign a plan." title="No active subscription" />
                )
              ) : (
                <div className="control-record control-record--standalone">
                  <div className="control-record__summary control-record__summary--static">
                    <span className="control-record-icon"><MaterialIcon name="workspace_premium" /></span>
                    <span><strong>{activePlan?.name ?? 'Subscription'}</strong><small>{formatDateTime(subscription.currentPeriodStartsAt)} — {formatDateTime(subscription.currentPeriodEndsAt)}</small></span>
                    <ControlStatus status={subscription.status} />
                  </div>
                  <div className="control-meta-grid control-meta-grid--three">
                    <div><span>Price</span><strong>{activePlan ? formatMinorAmount(activePlan.priceAmountMinor, activePlan.currency) : 'Not available'}</strong></div>
                    <div><span>Trial ends</span><strong>{formatDateTime(subscription.trialEndsAt)}</strong></div>
                    <div><span>Grace ends</span><strong>{formatDateTime(subscription.graceEndsAt)}</strong></div>
                  </div>
                  {billing.permissions.canManagePlatform && (
                    <div className="control-action-row">
                      <label className="control-inline-field">
                        <span>Subscription status</span>
                        <select disabled={billing.isMutating} onChange={(event) => void handleSubscriptionStatus(event.target.value as CompanySubscriptionStatus)} value={subscription.status}>
                          <option value="trialing">Trialing</option>
                          <option value="active">Active</option>
                          <option value="grace_period">Grace period</option>
                          <option value="suspended">Suspended</option>
                          <option value="canceled">Canceled</option>
                          <option value="expired">Expired</option>
                        </select>
                      </label>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </GlassPanel>

        <GlassPanel
          as="section"
          className="control-main-card control-main-card--full"
        >
          <ControlCardHeading
            action={
              <RefreshButton
                disabled={invoices.isRefreshing}
                onClick={() => void invoices.refresh()}
              />
            }
            description={`${invoices.invoices.length} invoice(s) are available for the selected company.`}
            eyebrow="Invoice History"
            title="Invoices"
          />

          {invoices.status === 'loading' || invoices.status === 'idle' ? (
            <div className="final-inline-loading">
              <MaterialIcon
                className="spin"
                name="progress_activity"
              />
              Loading invoices…
            </div>
          ) : invoices.status === 'forbidden' ? (
            <ControlEmpty
              icon="lock"
              message="Your account cannot view company invoices."
              title="Invoice access restricted"
            />
          ) : invoices.invoices.length === 0 ? (
            <ControlEmpty
              icon="receipt_long"
              message="Invoices will appear when a company subscription is created."
              title="No invoices"
            />
          ) : (
            <div className="control-table-wrap">
              <table className="control-table billing-invoice-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Package</th>
                    <th>Cost</th>
                    <th>Payment</th>
                    <th>Issued</th>
                    <th>Subscription</th>
                    <th>Started</th>
                    <th>Expired</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>
                        <strong>{invoice.invoiceNumber}</strong>
                        <small>
                          {invoice.externalReference ?? 'Internal invoice'}
                        </small>
                      </td>
                      <td>{invoice.planName}</td>
                      <td>
                        {formatMinorAmount(
                          invoice.amountMinor,
                          invoice.currency,
                        )}
                      </td>
                      <td>
                        <ControlStatus status={invoice.status === 'issued' ? 'unpaid' : invoice.status} />
                      </td>
                      <td>{formatDateTime(invoice.issuedAt)}</td>
                      <td>
                        <ControlStatus
                          status={subscription?.status ?? 'unassigned'}
                        />
                      </td>
                      <td>{formatDateTime(invoice.periodStartsAt)}</td>
                      <td>{formatDateTime(invoice.periodEndsAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </GlassPanel>

        {billing.permissions.canManagePlatform && (
          <GlassPanel as="section" className="control-main-card control-main-card--full">
            <ControlCardHeading description={`${billing.plans.length} plans in the platform catalog.`} eyebrow="Platform Catalog" title="Billing plans" />
            {billing.plans.length === 0 ? (
              <ControlEmpty icon="sell" message="Create a plan before assigning company access." title="No billing plans" />
            ) : (
              <div className="control-record-list control-record-list--cards">
                {billing.plans.map((plan) => (
                  <article className="control-record" key={plan.id}>
                    <div className="control-record__summary control-record__summary--static">
                      <span className="control-record-icon"><MaterialIcon name="sell" /></span>
                      <span><strong>{plan.name}</strong><small>{plan.code} · {formatLabel(plan.billingInterval)}</small></span>
                      <ControlStatus status={plan.status} />
                    </div>
                    <div className="control-meta-grid control-meta-grid--three">
                      <div><span>Price</span><strong>{formatMinorAmount(plan.priceAmountMinor, plan.currency)}</strong></div>
                      <div><span>Trial</span><strong>{plan.trialDays} days</strong></div>
                      <div><span>Entitlements</span><strong>{plan.entitlements.length}</strong></div>
                    </div>
                    <div className="control-action-row">
                      <select disabled={billing.isMutating} onChange={(event) => void handlePlanStatus(plan.id, event.target.value as BillingPlanStatus)} value={plan.status}>
                        <option value="active">Active</option>
                        <option value="archived">Archived</option>
                      </select>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </GlassPanel>
        )}
      </div>
    </div>
  );
}
