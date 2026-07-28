import { useMemo, useState } from 'react';
import { Link } from 'react-router';

import { MaterialIcon } from '../../components/icons/material-icon';
import { GlassPanel } from '../../components/ui/glass-panel';
import { useAuth } from '../../features/auth/use-auth';
import type { CatalogManager } from '../../features/catalog/catalog.types';
import { useCatalogOperations } from '../../features/catalog/use-catalog';
import { useCompany } from '../../features/companies/use-company';
import { useReportingDashboard } from '../../features/reporting/use-reporting-dashboard';
import type {
  ReportingMonetaryTotal,
  ReportingPerformanceRow,
} from '../../features/reporting/reporting.types';
import { ControlEmpty, ControlFeedback } from '../control-plane/control-plane-ui';
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
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
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
  const total = totals[0];

  if (total === undefined) {
    return '—';
  }

  return totals.length === 1
    ? formatMoney(total.payoutAmountMinor, total.currency)
    : `${totals.length} currencies`;
}

function conversionRate(conversions: number, clicks: number): string {
  return clicks === 0 ? '0.00%' : `${((conversions / clicks) * 100).toFixed(2)}%`;
}

function PerformanceTable({
  title,
  label,
  path,
  rows,
}: {
  title: string;
  label: string;
  path: string;
  rows: readonly ReportingPerformanceRow[];
}) {
  return (
    <GlassPanel as="section" className="dashboard-report-card">
      <div className="dashboard-card-heading">
        <div>
          <span>Live reporting</span>
          <h2>{title}</h2>
        </div>
        <Link to={path}>View all</Link>
      </div>
      {rows.length === 0 ? (
        <ControlEmpty
          icon="table_rows"
          message="Performance data will appear after tracked activity."
          title="No reporting rows"
        />
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
              {rows.slice(0, 8).map((row) => (
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

function ManagerAssignmentTable({ managers }: { managers: readonly CatalogManager[] }) {
  return (
    <GlassPanel as="section" className="dashboard-report-card">
      <div className="dashboard-card-heading">
        <div>
          <span>Company team</span>
          <h2>Managers</h2>
        </div>
        <Link to="/reports/managers">View report</Link>
      </div>
      {managers.length === 0 ? (
        <ControlEmpty
          icon="supervisor_account"
          message="Invite a Manager before assigning Offers."
          title="No Managers"
        />
      ) : (
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>Manager</th>
                <th>Assigned Offers</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {managers.slice(0, 8).map((manager) => (
                <tr key={manager.membershipId}>
                  <td>
                    <strong>
                      {manager.displayName ?? manager.email ?? manager.membershipId.slice(0, 8)}
                    </strong>
                    <small>Manager #{manager.publicId}</small>
                  </td>
                  <td>{formatCompact(manager.offerCount)}</td>
                  <td>{manager.membershipStatus}</td>
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
        <h1>Select a company</h1>
        <p>Company operations require an active company context.</p>
      </GlassPanel>
    );
  }

  if (!catalog.permissions.canReadCatalog) {
    return (
      <GlassPanel as="section" className="dashboard-setup-state">
        <MaterialIcon name="dashboard" />
        <h1>Performance dashboard</h1>
        <p>Use your assigned Offers and Reports to review activity.</p>
        <Link className="primary-gradient-button primary-gradient-button--compact" to="/reports/offers">
          Open reports
        </Link>
      </GlassPanel>
    );
  }

  if (
    reporting.isLoading ||
    catalog.isLoading ||
    reporting.dashboard === null ||
    catalog.snapshot === null
  ) {
    return (
      <GlassPanel as="section" className="dashboard-loading-state">
        <MaterialIcon className="spin" name="progress_activity" />
        <h1>Loading dashboard</h1>
      </GlassPanel>
    );
  }

  const dashboard = reporting.dashboard;
  const snapshot = catalog.snapshot;
  const metrics = [
    {
      label: 'Clicks',
      value: formatCompact(dashboard.totals.clicks),
      icon: 'ads_click',
      context: `${conversionRate(dashboard.totals.conversions, dashboard.totals.clicks)} conversion rate`,
      path: '/logs/clicks',
    },
    {
      label: 'Conversions',
      value: formatCompact(dashboard.totals.conversions),
      icon: 'sync_alt',
      context: `${formatCompact(dashboard.totals.approvedConversions)} approved`,
      path: '/logs/conversions',
    },
    {
      label: 'Total payout',
      value: formatPayout(dashboard.totals.monetaryTotals),
      icon: 'payments',
      context: 'Offer performance breakdown',
      path: '/reports/offers',
    },
    {
      label: 'Domains',
      value: snapshot.summary.domains.toString(),
      icon: 'dns',
      context: `${snapshot.domains.filter((item) => item.status === 'active').length} active`,
      path: '/domains/manage',
    },
    {
      label: 'Networks',
      value: snapshot.summary.networks.toString(),
      icon: 'account_tree',
      context: `${snapshot.networks.filter((item) => item.status === 'active').length} active`,
      path: '/networks/manage',
    },
    {
      label: 'Offers',
      value: snapshot.summary.offers.toString(),
      icon: 'local_offer',
      context: `${snapshot.offers.filter((item) => item.status === 'active').length} active`,
      path: '/offers/manage',
    },
    {
      label: 'Managers',
      value: snapshot.summary.managers.toString(),
      icon: 'supervisor_account',
      context: `${snapshot.managers.filter((item) => item.membershipStatus === 'active').length} active`,
      path: '/managers/manage',
    },
  ] as const;

  return (
    <div className="page-stack dashboard-page dashboard-page--company-admin">
      <header className="company-dashboard-heading">
        <div>
          <span className="eyebrow-chip"><MaterialIcon name="dashboard" />Company Dashboard</span>
          <h1>{company.activeCompany.name}</h1>
        </div>
        <div className="dashboard-date-filter dashboard-date-filter--compact">
          <label>
            <span>From</span>
            <input
              max={to}
              onChange={(event) => setFrom(event.currentTarget.value)}
              type="date"
              value={from}
            />
          </label>
          <label>
            <span>To</span>
            <input
              min={from}
              onChange={(event) => setTo(event.currentTarget.value)}
              type="date"
              value={to}
            />
          </label>
          <button
            className="control-icon-button"
            onClick={() => void Promise.all([reporting.refresh(), catalog.refresh()])}
            title="Refresh dashboard"
            type="button"
          >
            <MaterialIcon name="refresh" />
          </button>
        </div>
      </header>

      <ControlFeedback error={reporting.error ?? catalog.error} message={null} />

      <section aria-label="Dashboard metrics" className="dashboard-catalog-metrics">
        {metrics.map((metric) => (
          <Link className="dashboard-metric-link" key={metric.label} to={metric.path}>
            <GlassPanel as="article" className="dashboard-catalog-metric">
              <span className="dashboard-catalog-metric__icon"><MaterialIcon name={metric.icon} /></span>
              <div>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.context}</small>
              </div>
              <MaterialIcon className="dashboard-metric-link__arrow" name="arrow_forward" />
            </GlassPanel>
          </Link>
        ))}
      </section>

      <div className="dashboard-report-grid">
        <PerformanceTable
          label="Offer"
          path="/reports/offers"
          rows={dashboard.offers}
          title="Offers Report"
        />
        <ManagerAssignmentTable managers={snapshot.managers} />
      </div>
    </div>
  );
}

export function DashboardPage() {
  const auth = useAuth();

  return auth.identity?.authorization.platformRole === 'platform_super_admin'
    ? <SuperAdminDashboard />
    : <CompanyDashboard />;
}
