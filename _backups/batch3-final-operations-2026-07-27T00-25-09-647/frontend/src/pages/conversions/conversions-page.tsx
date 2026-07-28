import { useMemo, useState } from 'react';

import { MaterialIcon } from '../../components/icons/material-icon';
import { GlassPanel } from '../../components/ui/glass-panel';
import { useNetworkAccounts } from '../../features/tracking-networks/use-tracking-networks';
import type { ConversionStatus } from '../../features/control-plane/control-plane.types';
import { useConversions, useOffers } from '../../features/control-plane/use-control-plane';
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
import {
  formatDateTime,
  formatMinorAmount,
  shortId,
} from '../control-plane/control-plane-formatters';

export function ConversionsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ConversionStatus | 'all'>('all');
  const [offerId, setOfferId] = useState('');
  const [networkAccountId, setNetworkAccountId] = useState('');
  const conversions = useConversions({
    ...(status !== 'all' ? { status } : {}),
    ...(offerId.length > 0 ? { offerId } : {}),
    ...(networkAccountId.length > 0 ? { networkAccountId } : {}),
    limit: 200,
  });
  const offers = useOffers();
  const accounts = useNetworkAccounts();
  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();

    return conversions.conversions.filter(
      (conversion) =>
        normalized.length === 0 ||
        conversion.publicConversionId.toLowerCase().includes(normalized) ||
        conversion.externalConversionId.toLowerCase().includes(normalized) ||
        conversion.offerName.toLowerCase().includes(normalized) ||
        conversion.publicClickId.toLowerCase().includes(normalized),
    );
  }, [conversions.conversions, search]);

  if (conversions.status === 'forbidden') {
    return (
      <ControlAccessDenied
        message="Your current role does not have access to conversion records."
        title="Conversions unavailable"
      />
    );
  }

  if (conversions.status === 'loading' || conversions.status === 'idle') {
    return <ControlLoading label="conversions" />;
  }

  return (
    <div className="control-page">
      <ControlModuleHeader
        description={
          <>
            Review immutable attribution and financial snapshots for{' '}
            <strong>{conversions.companyName}</strong>.
          </>
        }
        eyebrow="Conversion Ledger"
        icon="sync_alt"
        stats={[
          { label: 'Visible', value: filtered.length },
          {
            label: 'Approved',
            value: conversions.conversions.filter((item) => item.status === 'approved').length,
          },
          {
            label: 'Pending',
            value: conversions.conversions.filter((item) => item.status === 'pending').length,
          },
        ]}
        title="Conversions"
      />

      <ControlFeedback error={conversions.error} message={null} />

      <GlassPanel as="section" className="control-main-card control-main-card--full">
        <ControlCardHeading
          action={
            <RefreshButton disabled={false} onClick={() => void conversions.refresh()} />
          }
          description={`${filtered.length} conversion records match the current scope.`}
          eyebrow="Financial Snapshot"
          title="Conversion directory"
        />

        <div className="control-filter-bar control-filter-bar--four">
          <label>
            <MaterialIcon name="search" />
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search conversion, click or offer"
              value={search}
            />
          </label>
          <select
            onChange={(event) => setStatus(event.target.value as ConversionStatus | 'all')}
            value={status}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="reversed">Reversed</option>
          </select>
          <select onChange={(event) => setOfferId(event.target.value)} value={offerId}>
            <option value="">All offers</option>
            {offers.offers.map((offer) => (
              <option key={offer.id} value={offer.id}>{offer.name}</option>
            ))}
          </select>
          <select
            onChange={(event) => setNetworkAccountId(event.target.value)}
            value={networkAccountId}
          >
            <option value="">All accounts</option>
            {accounts.accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </select>
        </div>

        {filtered.length === 0 ? (
          <ControlEmpty
            icon="receipt_long"
            message="Conversions will appear after an attributed provider postback is accepted."
            title="No conversion records"
          />
        ) : (
          <div className="control-table-wrap">
            <table className="control-table control-table--wide">
              <thead>
                <tr>
                  <th>Conversion</th>
                  <th>Offer</th>
                  <th>Click</th>
                  <th>Revenue</th>
                  <th>Payout</th>
                  <th>Status</th>
                  <th>Converted</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((conversion) => (
                  <tr key={conversion.id}>
                    <td>
                      <strong>{shortId(conversion.publicConversionId)}</strong>
                      <small>{shortId(conversion.externalConversionId)}</small>
                    </td>
                    <td>
                      <strong>{conversion.offerName}</strong>
                      <small>{conversion.offerCode}</small>
                    </td>
                    <td>{shortId(conversion.publicClickId)}</td>
                    <td>
                      {formatMinorAmount(
                        conversion.revenueAmountMinor,
                        conversion.revenueCurrency,
                      )}
                    </td>
                    <td>
                      {formatMinorAmount(
                        conversion.payoutAmountMinor,
                        conversion.payoutCurrency,
                      )}
                    </td>
                    <td><ControlStatus status={conversion.status} /></td>
                    <td>{formatDateTime(conversion.convertedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
