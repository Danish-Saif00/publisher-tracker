import { useMemo, useState } from 'react';

import { GlassPanel } from '../../components/ui/glass-panel';
import { useReporting } from '../../features/control-plane/use-control-plane';
import type { ReportingPerformanceRow } from '../../features/control-plane/control-plane.types';
import {
  formatCompactNumber,
  formatDateTime,
  formatMinorAmount,
  formatPercentage,
} from '../control-plane/control-plane-formatters';
import {
  ControlAccessDenied,
  ControlCardHeading,
  ControlEmpty,
  ControlFeedback,
  ControlLoading,
  ControlModuleHeader,
  RefreshButton,
} from '../control-plane/control-plane-ui';

function startOfRange(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function endOfToday(): string {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

function PerformanceTable({ rows, title }: { rows: readonly ReportingPerformanceRow[]; title: string }) {
  return (
    <GlassPanel as="section" className="control-main-card control-main-card--full">
      <ControlCardHeading description={`${rows.length} performance rows.`} title={title} />
      {rows.length === 0 ? (
        <ControlEmpty icon="query_stats" message="No activity exists in the selected reporting range." title={`No ${title.toLowerCase()}`} />
      ) : (
        <div className="control-table-wrap">
          <table className="control-table control-table--wide">
            <thead><tr><th>Name</th><th>Clicks</th><th>Conversions</th><th>Approved</th><th>Conversion rate</th><th>Revenue / payout</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.dimensionId}>
                  <td><strong>{row.dimensionName}</strong></td>
                  <td>{formatCompactNumber(row.clicks)}</td>
                  <td>{formatCompactNumber(row.conversions)}</td>
                  <td>{formatCompactNumber(row.approvedConversions)}</td>
                  <td>{formatPercentage(row.approvedConversions, row.clicks)}</td>
                  <td>
                    {row.monetaryTotals.length === 0
                      ? 'No approved value'
                      : row.monetaryTotals.map((total) => (
                          <span className="control-money-line" key={total.currency}>
                            {formatMinorAmount(total.revenueAmountMinor, total.currency)} / {formatMinorAmount(total.payoutAmountMinor, total.currency)}
                          </span>
                        ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassPanel>
  );
}

export function ReportsPage() {
  const [rangeDays, setRangeDays] = useState(30);
  const filters = useMemo(() => ({ from: startOfRange(rangeDays), to: endOfToday() }), [rangeDays]);
  const reporting = useReporting(filters);

  if (reporting.status === 'loading' || reporting.status === 'idle') {
    return <ControlLoading label="reports" />;
  }

  if (reporting.status === 'forbidden') {
    return <ControlAccessDenied message="Your account cannot view reports for the selected company." title="Reporting access restricted" />;
  }

  const dashboard = reporting.dashboard;
  const totals = dashboard?.totals;
  const primaryMoney = totals?.monetaryTotals[0] ?? null;

  return (
    <div className="control-page">
      <ControlModuleHeader
        description={<>Analyze company-scoped attribution and financial performance for <strong>{reporting.companyName}</strong>.</>}
        eyebrow="Performance Intelligence"
        icon="analytics"
        stats={[
          { label: 'Clicks', value: formatCompactNumber(totals?.clicks ?? 0) },
          { label: 'Approved', value: formatCompactNumber(totals?.approvedConversions ?? 0) },
          { label: 'CVR', value: formatPercentage(totals?.approvedConversions ?? 0, totals?.clicks ?? 0) },
        ]}
        title="Reports"
      />
      <ControlFeedback error={reporting.error} message={null} />

      <GlassPanel as="section" className="control-main-card control-main-card--full">
        <ControlCardHeading
          action={<RefreshButton disabled={false} onClick={() => void reporting.refresh()} />}
          description={dashboard ? `${formatDateTime(dashboard.period.from)} — ${formatDateTime(dashboard.period.to)}` : 'Select a reporting range.'}
          eyebrow="Reporting Window"
          title="Executive overview"
        />
        <div className="control-filter-bar control-filter-bar--compact">
          <label className="control-inline-field"><span>Range</span><select onChange={(event) => setRangeDays(Number(event.target.value))} value={rangeDays}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last 365 days</option></select></label>
        </div>
        <div className="report-kpi-grid">
          <article><span>Total clicks</span><strong>{formatCompactNumber(totals?.clicks ?? 0)}</strong><small>{formatCompactNumber(totals?.uniqueVisitors ?? 0)} unique visitors</small></article>
          <article><span>Conversions</span><strong>{formatCompactNumber(totals?.conversions ?? 0)}</strong><small>{formatCompactNumber(totals?.approvedConversions ?? 0)} approved</small></article>
          <article><span>Duplicate traffic</span><strong>{formatCompactNumber(totals?.duplicateClicks ?? 0)}</strong><small>{formatCompactNumber(totals?.highRiskClicks ?? 0)} high-risk clicks</small></article>
          <article><span>Revenue</span><strong>{primaryMoney ? formatMinorAmount(primaryMoney.revenueAmountMinor, primaryMoney.currency) : 'No approved revenue'}</strong><small>{primaryMoney ? `${formatMinorAmount(primaryMoney.payoutAmountMinor, primaryMoney.currency)} publisher payout` : 'No payout recorded'}</small></article>
        </div>
      </GlassPanel>

      <PerformanceTable rows={dashboard?.offers ?? []} title="Offer performance" />
      <PerformanceTable rows={dashboard?.members ?? []} title="Member performance" />
      <PerformanceTable rows={dashboard?.networkAccounts ?? []} title="Network performance" />
    </div>
  );
}
