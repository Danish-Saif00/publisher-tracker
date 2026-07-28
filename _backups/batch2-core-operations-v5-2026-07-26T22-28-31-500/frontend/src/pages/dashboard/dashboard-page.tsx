import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { GlassPanel } from '../../components/ui/glass-panel';
import { MaterialIcon } from '../../components/icons/material-icon';
import { useCompany } from '../../features/companies/use-company';
import { useReportingDashboard } from '../../features/reporting/use-reporting-dashboard';
import type {
  CompanyReportingDashboard,
  OperationalEvent,
  ReportingMonetaryTotal,
  ReportingPerformanceRow,
} from '../../features/reporting/reporting.types';

type MetricCard = {
  label: string;
  value: string;
  context: string;
  secondary?: string;
  tone: 'danger' | 'neutral' | 'violet';
  progress: number;
};

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: value >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: value >= 10_000 ? 1 : 0,
  }).format(value);
}

function formatPercentage(numerator: number, denominator: number): string {
  if (denominator <= 0) {
    return '0.0%';
  }

  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function currencyFractionDigits(currency: string): number {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

function formatMinorAmount(amountMinor: number, currency: string): string {
  const fractionDigits = currencyFractionDigits(currency);
  const amount = amountMinor / 10 ** fractionDigits;

  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      notation: Math.abs(amount) >= 100_000 ? 'compact' : 'standard',
      maximumFractionDigits: Math.abs(amount) >= 100_000 ? 1 : fractionDigits,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(fractionDigits)}`;
  }
}

function formatRevenue(total: ReportingMonetaryTotal | undefined): string {
  return total === undefined
    ? '—'
    : formatMinorAmount(total.revenueAmountMinor, total.currency);
}

function formatNetRevenue(totals: readonly ReportingMonetaryTotal[]): string {
  if (totals.length === 0) {
    return '—';
  }

  if (totals.length > 1) {
    return `${totals.length} currencies`;
  }

  const total = totals[0];

  if (total === undefined) {
    return '—';
  }

  return formatMinorAmount(
    total.revenueAmountMinor - total.payoutAmountMinor,
    total.currency,
  );
}

function createMetrics(dashboard: CompanyReportingDashboard): readonly MetricCard[] {
  const { totals } = dashboard;
  const approvedRate = formatPercentage(
    totals.approvedConversions,
    totals.conversions,
  );

  return [
    {
      label: 'Total Clicks',
      value: formatCompactNumber(totals.clicks),
      context: '30D',
      tone: 'neutral',
      progress: totals.clicks > 0 ? 66 : 0,
    },
    {
      label: 'Unique Visitors',
      value: formatCompactNumber(totals.uniqueVisitors),
      context: '30D',
      secondary: `${formatPercentage(totals.uniqueVisitors, totals.clicks)} of clicks`,
      tone: 'violet',
      progress: totals.clicks > 0
        ? Math.min(100, (totals.uniqueVisitors / totals.clicks) * 100)
        : 0,
    },
    {
      label: 'Conversions',
      value: formatCompactNumber(totals.conversions),
      context: '30D',
      secondary: `CR: ${formatPercentage(totals.conversions, totals.clicks)}`,
      tone: 'neutral',
      progress: totals.conversions > 0 ? 58 : 0,
    },
    {
      label: 'Net Revenue',
      value: formatNetRevenue(totals.monetaryTotals),
      context: '30D',
      ...(totals.monetaryTotals.length > 1
        ? { secondary: 'Multi-currency total' }
        : {}),
      tone: 'violet',
      progress: totals.monetaryTotals.length > 0 ? 82 : 0,
    },
    {
      label: 'High-Risk Clicks',
      value: formatCompactNumber(totals.highRiskClicks),
      context: approvedRate,
      secondary: `${formatCompactNumber(totals.duplicateClicks)} duplicate clicks`,
      tone: 'danger',
      progress: totals.clicks > 0
        ? Math.min(100, (totals.highRiskClicks / totals.clicks) * 100)
        : 0,
    },
  ] as const;
}

function formatPeriod(dashboard: CompanyReportingDashboard): string {
  const from = new Date(dashboard.period.from);
  const to = new Date(dashboard.period.to);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return 'Last 30 days';
  }

  const formatter = new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
  });

  return `${formatter.format(from)} – ${formatter.format(to)}`;
}

function ConversionPulse({
  companyName,
  dashboard,
}: {
  companyName: string;
  dashboard: CompanyReportingDashboard;
}) {
  const nodes = [
    { icon: 'ads_click', label: 'Click', active: dashboard.totals.clicks > 0 },
    { icon: 'link', label: 'Visitor', active: dashboard.totals.uniqueVisitors > 0 },
    { icon: 'inventory_2', label: 'Offer', active: dashboard.offers.length > 0 },
    { icon: 'check_circle', label: 'Conv', active: dashboard.totals.conversions > 0 },
  ] as const;

  return (
    <GlassPanel as="section" className="conversion-pulse">
      <div className="conversion-pulse__copy">
        <span className="eyebrow-chip">
          <MaterialIcon name="bolt" filled />
          Live Company Context
        </span>
        <h1>Conversion Pulse</h1>
        <p>
          Real attribution data for <strong>{companyName}</strong> across the selected
          reporting period: {formatPeriod(dashboard)}.
        </p>
        <div className="conversion-pulse__actions">
          <Link className="primary-gradient-button primary-gradient-button--compact" to="/reports">
            Open Reports
          </Link>
          <Link className="glass-button" to="/operations">
            View Operations
          </Link>
        </div>
      </div>

      <div className="conversion-flow glass-panel-heavy">
        {nodes.map((node, index) => (
          <div className="conversion-flow__segment" key={node.label}>
            <div className={`conversion-node ${node.active ? 'conversion-node--active' : ''}`}>
              <MaterialIcon name={node.icon} />
            </div>
            <span>{node.label}</span>
            {index < nodes.length - 1 && <div className="conversion-connector" />}
          </div>
        ))}
      </div>
    </GlassPanel>
  );
}

function MetricsGrid({ dashboard }: { dashboard: CompanyReportingDashboard }) {
  const metrics = createMetrics(dashboard);

  return (
    <section className="metrics-grid" aria-label="Performance metrics">
      {metrics.map((metric) => (
        <GlassPanel className={`metric-card metric-card--${metric.tone}`} key={metric.label}>
          <span className="metric-card__label">{metric.label}</span>
          <div className="metric-card__value-row">
            <strong>{metric.value}</strong>
            <span className={metric.tone === 'danger' ? 'metric-change--danger' : 'metric-change'}>
              {metric.context}
            </span>
          </div>
          {metric.secondary !== undefined && (
            <span className="metric-card__secondary">{metric.secondary}</span>
          )}
          <div className="metric-progress">
            <span style={{ width: `${metric.progress}%` }} />
          </div>
        </GlassPanel>
      ))}
    </section>
  );
}

function RevenueDistribution({ rows }: { rows: readonly ReportingPerformanceRow[] }) {
  const rankedRows = [...rows]
    .sort(
      (first, second) =>
        (second.monetaryTotals[0]?.revenueAmountMinor ?? 0) -
        (first.monetaryTotals[0]?.revenueAmountMinor ?? 0),
    )
    .slice(0, 6);
  const maximum = Math.max(
    1,
    ...rankedRows.map((row) => row.monetaryTotals[0]?.revenueAmountMinor ?? 0),
  );

  return (
    <GlassPanel as="section" className="revenue-panel revenue-distribution-panel">
      <div className="panel-heading">
        <div>
          <h2>Offer Revenue Distribution</h2>
          <p>Revenue contribution during the current reporting period</p>
        </div>
        <span className="data-source-badge">Live API</span>
      </div>

      {rankedRows.length === 0 ? (
        <div className="chart-empty-state">
          <MaterialIcon name="query_stats" />
          <span>No offer revenue has been recorded for this period.</span>
        </div>
      ) : (
        <div className="performance-bar-list">
          {rankedRows.map((row) => {
            const total = row.monetaryTotals[0];
            const amount = total?.revenueAmountMinor ?? 0;

            return (
              <div className="performance-bar" key={row.dimensionId}>
                <div className="performance-bar__heading">
                  <span>{row.dimensionName}</span>
                  <strong>{formatRevenue(total)}</strong>
                </div>
                <div className="performance-bar__track">
                  <span style={{ width: `${Math.max(2, (amount / maximum) * 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </GlassPanel>
  );
}

function humanize(value: string): string {
  return value
    .replace(/[._-]+/gu, ' ')
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

function formatRelativeTime(value: string): string {
  const date = new Date(value);
  const differenceMs = date.getTime() - Date.now();

  if (Number.isNaN(date.getTime())) {
    return 'Recently';
  }

  const minutes = Math.round(differenceMs / 60_000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  if (Math.abs(minutes) < 60) {
    return formatter.format(minutes, 'minute');
  }

  const hours = Math.round(minutes / 60);

  if (Math.abs(hours) < 24) {
    return formatter.format(hours, 'hour');
  }

  return formatter.format(Math.round(hours / 24), 'day');
}

function eventTone(event: OperationalEvent): 'danger' | 'neutral' | 'success' | 'violet' {
  const name = event.eventName.toLowerCase();

  if (name.includes('fraud') || name.includes('failed') || name.includes('suspended')) {
    return 'danger';
  }

  if (name.includes('conversion') || name.includes('created') || name.includes('sent')) {
    return 'success';
  }

  if (name.includes('payment') || name.includes('payout') || name.includes('updated')) {
    return 'violet';
  }

  return 'neutral';
}

function LiveStream({ events }: { events: readonly OperationalEvent[] }) {
  return (
    <GlassPanel as="section" className="live-stream">
      <div className="panel-heading">
        <h2>Live Stream</h2>
        <span className="data-source-badge">Operations</span>
      </div>
      {events.length === 0 ? (
        <div className="chart-empty-state chart-empty-state--compact">
          <MaterialIcon name="monitor_heart" />
          <span>No operational events are available yet.</span>
        </div>
      ) : (
        <div className="live-stream__list">
          {events.map((event) => (
            <article className={`live-event live-event--${eventTone(event)}`} key={event.id}>
              <span className="live-event__dot" />
              <div>
                <h3>{humanize(event.eventName)}</h3>
                <p>
                  {humanize(event.entityType)}
                  {event.entityId === null ? '' : ` • ${event.entityId.slice(0, 8)}`}
                </p>
                <time>{formatRelativeTime(event.createdAt)}</time>
              </div>
            </article>
          ))}
        </div>
      )}
    </GlassPanel>
  );
}

function DataTableCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <GlassPanel as="section" className="data-table-card">
      <div className="data-table-card__heading">
        <h2>{title}</h2>
        <Link to="/reports">View All</Link>
      </div>
      {children}
    </GlassPanel>
  );
}

function PerformanceTable({
  rows,
  dimensionLabel,
}: {
  rows: readonly ReportingPerformanceRow[];
  dimensionLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="table-empty-state">
        <MaterialIcon name="table_rows" />
        No performance rows are available.
      </div>
    );
  }

  return (
    <div className="responsive-table">
      <table>
        <thead>
          <tr>
            <th>{dimensionLabel}</th>
            <th>Clicks</th>
            <th>Revenue</th>
            <th>CR</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 5).map((row) => (
            <tr key={row.dimensionId}>
              <td>
                <span className="publisher-avatar">
                  {row.dimensionName.charAt(0).toUpperCase()}
                </span>
                {row.dimensionName}
              </td>
              <td>{formatCompactNumber(row.clicks)}</td>
              <td className="positive-value">{formatRevenue(row.monetaryTotals[0])}</td>
              <td>{formatPercentage(row.conversions, row.clicks)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DashboardSetupState() {
  return (
    <GlassPanel as="section" className="dashboard-setup-state specular-panel">
      <div className="dashboard-setup-state__icon">
        <MaterialIcon name="domain_add" />
      </div>
      <span className="eyebrow-chip">Tenant Setup Required</span>
      <h1>Create or select a company</h1>
      <p>
        Reporting, offers, tracking, payouts, and operations are company-scoped. Create
        the first tenant workspace to activate the dashboard.
      </p>
      <Link className="primary-gradient-button primary-gradient-button--compact" to="/companies">
        Open Companies
      </Link>
    </GlassPanel>
  );
}

export function DashboardPage() {
  const company = useCompany();
  const reporting = useReportingDashboard();

  if (company.status === 'loading') {
    return (
      <GlassPanel as="section" className="dashboard-loading-state">
        <MaterialIcon className="spin" name="progress_activity" />
        <h1>Loading company context</h1>
        <p>Publisher Tracker is resolving the active tenant.</p>
      </GlassPanel>
    );
  }

  if (company.activeCompany === null) {
    return <DashboardSetupState />;
  }

  if (reporting.error !== null) {
    return (
      <GlassPanel as="section" className="dashboard-error-state">
        <MaterialIcon name="error" />
        <h1>Reporting data unavailable</h1>
        <p>{reporting.error}</p>
        <button
          className="primary-gradient-button primary-gradient-button--compact"
          onClick={() => void reporting.refresh()}
          type="button"
        >
          Retry
        </button>
      </GlassPanel>
    );
  }

  if (reporting.isLoading || reporting.dashboard === null) {
    return (
      <GlassPanel as="section" className="dashboard-loading-state">
        <MaterialIcon className="spin" name="progress_activity" />
        <h1>Loading live reporting</h1>
        <p>Reading attribution data for {company.activeCompany.name}.</p>
      </GlassPanel>
    );
  }

  return (
    <div className="dashboard-page page-stack">
      <ConversionPulse
        companyName={company.activeCompany.name}
        dashboard={reporting.dashboard}
      />
      <MetricsGrid dashboard={reporting.dashboard} />

      <div className="dashboard-grid dashboard-grid--analytics">
        <RevenueDistribution rows={reporting.dashboard.offers} />
        <LiveStream events={reporting.events} />
      </div>

      <div className="dashboard-grid dashboard-grid--tables">
        <DataTableCard title="Top Publishers">
          <PerformanceTable
            dimensionLabel="Publisher"
            rows={reporting.dashboard.members}
          />
        </DataTableCard>

        <DataTableCard title="Top Offers">
          <PerformanceTable dimensionLabel="Offer" rows={reporting.dashboard.offers} />
        </DataTableCard>
      </div>
    </div>
  );
}
