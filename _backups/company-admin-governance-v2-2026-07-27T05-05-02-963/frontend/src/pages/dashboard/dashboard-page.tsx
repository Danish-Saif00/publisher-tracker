import { useMemo, useState } from 'react';
import { Link } from 'react-router';

import { MaterialIcon } from '../../components/icons/material-icon';
import { GlassPanel } from '../../components/ui/glass-panel';
import { useAuth } from '../../features/auth/use-auth';
import { useCatalogOperations } from '../../features/catalog/use-catalog';
import { useCompany } from '../../features/companies/use-company';
import { useReportingDashboard } from '../../features/reporting/use-reporting-dashboard';
import type {
  ReportingMonetaryTotal,
  ReportingPerformanceRow,
} from '../../features/reporting/reporting.types';
import { ControlEmpty, ControlFeedback, ControlStatus } from '../control-plane/control-plane-ui';
import { SuperAdminDashboard } from './super-admin-dashboard';

function dateInputValue(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function initialFrom(): string {
  const date = new Date();
  date.setDate(date.getDate() - 29);
  return dateInputValue(date);
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat('en-US', {
    notation: value >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

function currencyFractionDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

function formatMoney(amountMinor: number, currency: string): string {
  const amount = amountMinor / 10 ** currencyFractionDigits(currency);
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      notation: Math.abs(amount) >= 100_000 ? 'compact' : 'standard',
      maximumFractionDigits: Math.abs(amount) >= 100_000 ? 1 : undefined,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function formatPayout(totals: readonly ReportingMonetaryTotal[]): string {
  if (totals.length === 0) {
    return '—';
  }

  if (totals.length > 1) {
    return `${totals.length} currencies`;
  }

  const total = totals[0];
  return total === undefined ? '—' : formatMoney(total.payoutAmountMinor, total.currency);
}

function conversionRate(conversions: number, clicks: number): string {
  return clicks === 0 ? '0.00%' : `${((conversions / clicks) * 100).toFixed(2)}%`;
}

function PerformanceTable({
  title,
  label,
  rows,
}: {
  title: string;
  label: string;
  rows: readonly ReportingPerformanceRow[];
}) {
  return (
    <GlassPanel as="section" className="dashboard-report-card">
      <div className="dashboard-card-heading">
        <div>
          <span>Live reporting</span>
          <h2>{title}</h2>
        </div>
        <Link to="/reports">View all</Link>
      </div>
      {rows.length === 0 ? (
        <ControlEmpty icon="table_rows" title="No reporting rows" message="Performance data will appear after tracked activity." />
      ) : (
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>{label}</th>
                <th>Clicks</th>
                <th>Conversions</th>
                <th>CR</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 6).map((row) => (
                <tr key={row.dimensionId}>
                  <td><strong>{row.dimensionName}</strong></td>
                  <td>{formatCompact(row.clicks)}</td>
                  <td>{formatCompact(row.conversions)}</td>
                  <td>{conversionRate(row.conversions, row.clicks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassPanel>
  );
}

function CompanyDashboard() {
  const company = useCompany();
  const catalog = useCatalogOperations();
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(() => dateInputValue(new Date()));
  const reportingFilters = useMemo(
    () => ({
      from: `${from}T00:00:00.000Z`,
      to: `${to}T23:59:59.999Z`,
    }),
    [from, to],
  );
  const reporting = useReportingDashboard(reportingFilters);

  if (company.status === 'loading') {
    return (
      <GlassPanel as="section" className="dashboard-loading-state">
        <MaterialIcon className="spin" name="progress_activity" />
        <h1>Loading company context</h1>
      </GlassPanel>
    );
  }

  if (company.activeCompany === null) {
    return (
      <GlassPanel as="section" className="dashboard-setup-state">
        <MaterialIcon name="domain_add" />
        <h1>Create or select a company</h1>
        <p>Dashboard and operational modules require an active company context.</p>
        <Link className="primary-gradient-button primary-gradient-button--compact" to="/companies">Open companies</Link>
      </GlassPanel>
    );
  }

  if (!catalog.permissions.canReadCatalog) {
    return (
      <GlassPanel as="section" className="dashboard-setup-state">
        <MaterialIcon name="dashboard" />
        <h1>Publisher performance</h1>
        <p>Use Reports and Tracking Links to review your assigned offer activity.</p>
        <Link className="primary-gradient-button primary-gradient-button--compact" to="/reports">Open reports</Link>
      </GlassPanel>
    );
  }

  if (reporting.isLoading || catalog.isLoading || reporting.dashboard === null || catalog.snapshot === null) {
    return (
      <GlassPanel as="section" className="dashboard-loading-state">
        <MaterialIcon className="spin" name="progress_activity" />
        <h1>Loading dashboard</h1>
        <p>Publisher Tracker is synchronizing catalog and attribution metrics.</p>
      </GlassPanel>
    );
  }

  const dashboard = reporting.dashboard;
  const snapshot = catalog.snapshot;
  const metricCards = [
    { label: 'Clicks', value: formatCompact(dashboard.totals.clicks), icon: 'ads_click', context: conversionRate(dashboard.totals.conversions, dashboard.totals.clicks) + ' conversion rate' },
    { label: 'Conversions', value: formatCompact(dashboard.totals.conversions), icon: 'sync_alt', context: `${formatCompact(dashboard.totals.approvedConversions)} approved` },
    { label: 'Total payout', value: formatPayout(dashboard.totals.monetaryTotals), icon: 'payments', context: 'Selected period' },
    { label: 'Domains', value: snapshot.summary.domains.toString(), icon: 'dns', context: `${snapshot.domains.filter((item) => item.status === 'active').length} active` },
    { label: 'Networks', value: snapshot.summary.networks.toString(), icon: 'account_tree', context: `${snapshot.networks.filter((item) => item.status === 'active').length} active` },
    { label: 'Offers', value: snapshot.summary.offers.toString(), icon: 'local_offer', context: `${snapshot.offers.filter((item) => item.status === 'active').length} active` },
    { label: 'Publishers', value: snapshot.summary.publishers.toString(), icon: 'group', context: `${snapshot.publishers.filter((item) => item.membershipStatus === 'active').length} active` },
  ] as const;

  return (
    <div className="page-stack dashboard-page dashboard-page--catalog">
      <GlassPanel as="section" className="dashboard-command-bar">
        <div>
          <span className="eyebrow-chip"><MaterialIcon name="dashboard" />Company Dashboard</span>
          <h1>{company.activeCompany.name}</h1>
          <p>Catalog totals and attribution performance for the selected date range.</p>
        </div>
        <div className="dashboard-date-filter">
          <label><span>From</span><input max={to} onChange={(event) => setFrom(event.currentTarget.value)} type="date" value={from} /></label>
          <label><span>To</span><input min={from} onChange={(event) => setTo(event.currentTarget.value)} type="date" value={to} /></label>
          <button className="control-icon-button" onClick={() => void Promise.all([reporting.refresh(), catalog.refresh()])} title="Refresh" type="button"><MaterialIcon name="refresh" /></button>
        </div>
      </GlassPanel>

      <ControlFeedback error={reporting.error ?? catalog.error} message={null} />

      <section aria-label="Dashboard metrics" className="dashboard-catalog-metrics">
        {metricCards.map((metric) => (
          <GlassPanel as="article" className="dashboard-catalog-metric" key={metric.label}>
            <span className="dashboard-catalog-metric__icon"><MaterialIcon name={metric.icon} /></span>
            <div><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.context}</small></div>
          </GlassPanel>
        ))}
      </section>

      <div className="dashboard-quick-status">
        <GlassPanel as="section">
          <div className="dashboard-card-heading"><div><span>Operational readiness</span><h2>Catalog status</h2></div></div>
          <div className="dashboard-status-grid">
            <div><span>Primary domain</span><strong>{snapshot.domains.find((item) => item.isPrimary)?.hostname ?? 'Not configured'}</strong></div>
            <div><span>Pending domains</span><strong>{snapshot.domains.filter((item) => item.status === 'pending_verification').length}</strong></div>
            <div><span>Paused offers</span><strong>{snapshot.offers.filter((item) => item.status === 'paused').length}</strong></div>
            <div><span>Risk clicks</span><strong>{formatCompact(dashboard.totals.highRiskClicks)}</strong></div>
          </div>
        </GlassPanel>
        <GlassPanel as="section">
          <div className="dashboard-card-heading"><div><span>Live records</span><h2>Recent operations</h2></div><Link to="/operations">Open</Link></div>
          {reporting.events.length === 0 ? <ControlEmpty icon="monitor_heart" title="No events yet" message="Operational events will appear here." /> : (
            <div className="dashboard-event-list">
              {reporting.events.slice(0, 5).map((event) => (
                <article key={event.id}><MaterialIcon name="bolt" /><div><strong>{event.eventName.replaceAll('.', ' ')}</strong><span>{new Date(event.createdAt).toLocaleString()}</span></div><ControlStatus status="active" /></article>
              ))}
            </div>
          )}
        </GlassPanel>
      </div>

      <div className="dashboard-report-grid">
        <PerformanceTable label="Offer" rows={dashboard.offers} title="Offers report" />
        <PerformanceTable label="Publisher" rows={dashboard.members} title="Publishers report" />
      </div>
    </div>
  );
}


export function DashboardPage() {
  const auth = useAuth();
  const platformAdmin =
    auth.identity?.authorization.platformRole === 'platform_super_admin';

  return platformAdmin ? <SuperAdminDashboard /> : <CompanyDashboard />;
}
