import {
  useMemo,
  useState,
} from 'react';

import { MaterialIcon } from '../../components/icons/material-icon';
import { GlassPanel } from '../../components/ui/glass-panel';
import { CatalogPagination } from '../control-plane/catalog-page-ui';
import type {
  OperationalDevice,
  PerformanceReportDimension,
} from '../../features/final-operations/final-operations.types';
import { usePerformanceReport } from '../../features/final-operations/use-final-operations';
import {
  formatCompactNumber,
  formatLabel,
  formatPercentage,
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

const PAGE_SIZE = 20;

const REPORT_CONFIGURATION: Readonly<
  Record<
    PerformanceReportDimension,
    {
      readonly eyebrow: string;
      readonly title: string;
      readonly singular: string;
      readonly statuses: readonly string[];
    }
  >
> = {
  networks: {
    eyebrow: 'Network Performance',
    title: 'Networks Report',
    singular: 'network',
    statuses: ['active', 'suspended', 'archived'],
  },
  offers: {
    eyebrow: 'Offer Performance',
    title: 'Offers Report',
    singular: 'offer',
    statuses: ['draft', 'active', 'paused', 'archived'],
  },
  publishers: {
    eyebrow: 'Publisher Performance',
    title: 'Publishers Report',
    singular: 'publisher',
    statuses: ['invited', 'active', 'suspended', 'revoked'],
  },
};

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

export function ReportsPage({
  dimension,
}: {
  dimension: PerformanceReportDimension;
}) {
  const configuration = REPORT_CONFIGURATION[dimension];
  const [rangeDays, setRangeDays] = useState(30);
  const [search, setSearch] = useState('');
  const [dimensionStatus, setDimensionStatus] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [device, setDevice] = useState<OperationalDevice | ''>('');
  const [page, setPage] = useState(1);
  const filters = useMemo(
    () => ({
      from: startOfRange(rangeDays),
      to: endOfToday(),
      ...(search.trim().length > 0 ? { search: search.trim() } : {}),
      ...(dimensionStatus !== '' ? { dimensionStatus } : {}),
      ...(countryCode.trim().length > 0
        ? { countryCode: countryCode.trim().toUpperCase() }
        : {}),
      ...(device !== '' ? { device } : {}),
      limit: 500,
    }),
    [
      countryCode,
      device,
      dimensionStatus,
      rangeDays,
      search,
    ],
  );
  const report = usePerformanceReport(dimension, filters);

  if (report.status === 'loading' || report.status === 'idle') {
    return <ControlLoading label={configuration.title.toLowerCase()} />;
  }

  if (report.status === 'forbidden') {
    return (
      <ControlAccessDenied
        message="Your account cannot view reports for the selected company."
        title="Reporting access restricted"
      />
    );
  }

  const totals = report.rows.reduce(
    (result, row) => ({
      approvedClicks: result.approvedClicks + row.approvedClicks,
      rejectedClicks: result.rejectedClicks + row.rejectedClicks,
      uncheckedClicks: result.uncheckedClicks + row.uncheckedClicks,
      totalClicks: result.totalClicks + row.totalClicks,
      approvedConversions:
        result.approvedConversions + row.approvedConversions,
      rejectedConversions:
        result.rejectedConversions + row.rejectedConversions,
      uncheckedConversions:
        result.uncheckedConversions + row.uncheckedConversions,
      totalConversions:
        result.totalConversions + row.totalConversions,
    }),
    {
      approvedClicks: 0,
      rejectedClicks: 0,
      uncheckedClicks: 0,
      totalClicks: 0,
      approvedConversions: 0,
      rejectedConversions: 0,
      uncheckedConversions: 0,
      totalConversions: 0,
    },
  );
  const pageCount = Math.max(
    1,
    Math.ceil(report.rows.length / PAGE_SIZE),
  );
  const safePage = Math.min(page, pageCount);
  const visibleRows = report.rows.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  return (
    <div className="control-page final-operations-page">
      <ControlModuleHeader
        description={
          <>
            Compare approved, rejected, and unchecked attribution for{' '}
            <strong>{report.companyName}</strong>.
          </>
        }
        eyebrow={configuration.eyebrow}
        icon="analytics"
        stats={[
          {
            label: 'Clicks',
            value: formatCompactNumber(totals.totalClicks),
          },
          {
            label: 'Conversions',
            value: formatCompactNumber(totals.totalConversions),
          },
          {
            label: 'Approved CVR',
            value: formatPercentage(
              totals.approvedConversions,
              totals.totalClicks,
            ),
          },
        ]}
        title={configuration.title}
      />

      <ControlFeedback error={report.error} message={null} />

      <GlassPanel
        as="section"
        className="control-main-card control-main-card--full"
      >
        <ControlCardHeading
          action={
            <RefreshButton
              disabled={report.isRefreshing}
              onClick={() => void report.refresh()}
            />
          }
          description={`${report.rows.length} ${configuration.singular} performance row(s) match the current filters.`}
          eyebrow="Reporting Filters"
          title="Performance directory"
        />

        <div className="final-filter-grid">
          <label className="final-search-field">
            <MaterialIcon name="search" />
            <input
              onChange={(event) => {
                setSearch(event.currentTarget.value);
                setPage(1);
              }}
              placeholder={`Search ${configuration.singular}`}
              value={search}
            />
          </label>

          <label>
            <span>Range</span>
            <select
              onChange={(event) => {
                setRangeDays(Number(event.currentTarget.value));
                setPage(1);
              }}
              value={rangeDays}
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last 365 days</option>
            </select>
          </label>

          <label>
            <span>Status</span>
            <select
              onChange={(event) => {
                setDimensionStatus(event.currentTarget.value);
                setPage(1);
              }}
              value={dimensionStatus}
            >
              <option value="">All statuses</option>
              {configuration.statuses.map((status) => (
                <option key={status} value={status}>
                  {formatLabel(status)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Country</span>
            <input
              maxLength={2}
              onChange={(event) => {
                setCountryCode(event.currentTarget.value.toUpperCase());
                setPage(1);
              }}
              placeholder="US"
              value={countryCode}
            />
          </label>

          <label>
            <span>Device</span>
            <select
              onChange={(event) => {
                setDevice(
                  event.currentTarget.value as OperationalDevice | '',
                );
                setPage(1);
              }}
              value={device}
            >
              <option value="">All devices</option>
              <option value="desktop">Desktop</option>
              <option value="mobile">Mobile</option>
              <option value="tablet">Tablet</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>

        {report.rows.length === 0 ? (
          <ControlEmpty
            icon="query_stats"
            message="No reporting activity exists in the selected range."
            title={`No ${configuration.title.toLowerCase()}`}
          />
        ) : (
          <>
            <div className="control-table-wrap">
              <table className="control-table final-report-table">
                <thead>
                  <tr>
                    <th>{formatLabel(configuration.singular)}</th>
                    <th>Approved clicks</th>
                    <th>Rejected clicks</th>
                    <th>Unchecked clicks</th>
                    <th>Total clicks</th>
                    <th>Approved conversions</th>
                    <th>Rejected conversions</th>
                    <th>Unchecked conversions</th>
                    <th>Total conversions</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.dimensionId}>
                      <td>
                        <strong>{row.dimensionName}</strong>
                        <small>{row.dimensionId.slice(0, 8)}</small>
                      </td>
                      <td>{formatCompactNumber(row.approvedClicks)}</td>
                      <td>{formatCompactNumber(row.rejectedClicks)}</td>
                      <td>{formatCompactNumber(row.uncheckedClicks)}</td>
                      <td><strong>{formatCompactNumber(row.totalClicks)}</strong></td>
                      <td>{formatCompactNumber(row.approvedConversions)}</td>
                      <td>{formatCompactNumber(row.rejectedConversions)}</td>
                      <td>{formatCompactNumber(row.uncheckedConversions)}</td>
                      <td><strong>{formatCompactNumber(row.totalConversions)}</strong></td>
                      <td><ControlStatus status={row.dimensionStatus} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th>Totals</th>
                    <th>{formatCompactNumber(totals.approvedClicks)}</th>
                    <th>{formatCompactNumber(totals.rejectedClicks)}</th>
                    <th>{formatCompactNumber(totals.uncheckedClicks)}</th>
                    <th>{formatCompactNumber(totals.totalClicks)}</th>
                    <th>{formatCompactNumber(totals.approvedConversions)}</th>
                    <th>{formatCompactNumber(totals.rejectedConversions)}</th>
                    <th>{formatCompactNumber(totals.uncheckedConversions)}</th>
                    <th>{formatCompactNumber(totals.totalConversions)}</th>
                    <th>—</th>
                  </tr>
                </tfoot>
              </table>
            </div>

            <CatalogPagination
              onPage={setPage}
              page={safePage}
              pageCount={pageCount}
            />
          </>
        )}
      </GlassPanel>
    </div>
  );
}
