import { type FormEvent, useMemo, useState } from 'react';

import { MaterialIcon } from '../../components/icons/material-icon';
import { GlassPanel } from '../../components/ui/glass-panel';
import { COUNTRY_OPTIONS, DAY_OPTIONS, TIMEZONE_OPTIONS } from '../../features/catalog/catalog-options';
import type {
  CatalogDevice,
  CatalogOffer,
  CatalogOfferStatus,
  CatalogRedirectType,
  CatalogReferrerMode,
  CreateCatalogOfferInput,
} from '../../features/catalog/catalog.types';
import { useCatalogOperations } from '../../features/catalog/use-catalog';
import {
  CatalogPagination,
  CatalogToolbar,
  CheckboxGrid,
  RowActions,
  ToggleField,
} from '../control-plane/catalog-page-ui';
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
import { formatDateTime } from '../control-plane/control-plane-formatters';

const PAGE_SIZE = 8;
const DEVICE_OPTIONS = [
  ['desktop', 'Desktop'],
  ['android', 'Android'],
  ['ios', 'iOS'],
] as const;

type OfferFormState = {
  networkAccountId: string;
  trackingDomainId: string;
  code: string;
  externalOfferId: string;
  name: string;
  description: string;
  countries: readonly string[];
  devices: readonly CatalogDevice[];
  desktopUrl: string;
  androidUrl: string;
  iosUrl: string;
  redirectType: CatalogRedirectType;
  referrerMode: CatalogReferrerMode;
  payoutAmount: string;
  payoutCurrency: string;
  timezone: string;
  activeDays: readonly number[];
  activeStartTime: string;
  activeEndTime: string;
  proxyEnabled: boolean;
  expiresAt: string;
  duplicateAllowed: boolean;
  publisherMembershipIds: readonly string[];
  status: CatalogOfferStatus;
};

function emptyForm(): OfferFormState {
  return {
    networkAccountId: '',
    trackingDomainId: '',
    code: '',
    externalOfferId: '',
    name: '',
    description: '',
    countries: [],
    devices: ['desktop'],
    desktopUrl: '',
    androidUrl: '',
    iosUrl: '',
    redirectType: '302',
    referrerMode: 'preserve',
    payoutAmount: '',
    payoutCurrency: 'USD',
    timezone: 'UTC',
    activeDays: [1, 2, 3, 4, 5, 6, 7],
    activeStartTime: '',
    activeEndTime: '',
    proxyEnabled: false,
    expiresAt: '',
    duplicateAllowed: false,
    publisherMembershipIds: [],
    status: 'draft',
  };
}

function currencyFractionDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

function amountToMinor(amount: string, currency: string): number | null {
  const normalized = amount.trim();

  if (normalized.length === 0) {
    return null;
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Payout must be a positive number.');
  }

  return Math.round(parsed * 10 ** currencyFractionDigits(currency));
}

function minorToAmount(amountMinor: number | null, currency: string | null): string {
  if (amountMinor === null || currency === null) {
    return '';
  }

  return (amountMinor / 10 ** currencyFractionDigits(currency)).toString();
}

function toDateTimeLocal(value: string | null): string {
  if (value === null) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formFromOffer(offer: CatalogOffer): OfferFormState {
  return {
    networkAccountId: offer.networkAccountId,
    trackingDomainId: offer.trackingDomainId ?? '',
    code: offer.code,
    externalOfferId: offer.externalOfferId ?? '',
    name: offer.name,
    description: offer.description ?? '',
    countries: offer.countries,
    devices: offer.devices,
    desktopUrl: offer.desktopUrl ?? '',
    androidUrl: offer.androidUrl ?? '',
    iosUrl: offer.iosUrl ?? '',
    redirectType: offer.redirectType,
    referrerMode: offer.referrerMode,
    payoutAmount: minorToAmount(offer.defaultPayoutAmountMinor, offer.payoutCurrency),
    payoutCurrency: offer.payoutCurrency ?? 'USD',
    timezone: offer.timezone,
    activeDays: offer.activeDays,
    activeStartTime: offer.activeStartTime?.slice(0, 5) ?? '',
    activeEndTime: offer.activeEndTime?.slice(0, 5) ?? '',
    proxyEnabled: offer.proxyEnabled,
    expiresAt: toDateTimeLocal(offer.expiresAt),
    duplicateAllowed: offer.duplicateAllowed,
    publisherMembershipIds: offer.publisherMembershipIds,
    status: offer.status,
  };
}

function OfferForm({
  form,
  mode,
  disabled,
  networks,
  domains,
  publishers,
  onChange,
  onSubmit,
  onCancel,
}: {
  form: OfferFormState;
  mode: 'create' | 'edit';
  disabled: boolean;
  networks: readonly { id: string; name: string; providerName: string }[];
  domains: readonly { id: string; hostname: string }[];
  publishers: readonly { membershipId: string; label: string }[];
  onChange: (form: OfferFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
}) {
  const deviceValues = form.devices as readonly (string | number)[];
  const dayValues = form.activeDays as readonly (string | number)[];

  return (
    <form className="catalog-form" onSubmit={onSubmit}>
      <div className="catalog-form-grid catalog-form-grid--three">
        <label>
          <span>Name</span>
          <input
            disabled={disabled}
            maxLength={160}
            onChange={(event) => onChange({ ...form, name: event.currentTarget.value })}
            required
            value={form.name}
          />
        </label>
        <label>
          <span>Offer code</span>
          <input
            disabled={disabled || mode === 'edit'}
            maxLength={80}
            onChange={(event) => onChange({ ...form, code: event.currentTarget.value })}
            pattern="[a-z0-9_-]+"
            required
            value={form.code}
          />
        </label>
        <label>
          <span>External offer ID</span>
          <input
            disabled={disabled}
            onChange={(event) => onChange({ ...form, externalOfferId: event.currentTarget.value })}
            value={form.externalOfferId}
          />
        </label>
        <label>
          <span>Network</span>
          <select
            disabled={disabled || mode === 'edit'}
            onChange={(event) => onChange({ ...form, networkAccountId: event.currentTarget.value })}
            required
            value={form.networkAccountId}
          >
            <option value="">Select network</option>
            {networks.map((network) => (
              <option key={network.id} value={network.id}>
                {network.name} · {network.providerName}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Domain</span>
          <select
            disabled={disabled}
            onChange={(event) => onChange({ ...form, trackingDomainId: event.currentTarget.value })}
            required
            value={form.trackingDomainId}
          >
            <option value="">Select verified domain</option>
            {domains.map((domain) => (
              <option key={domain.id} value={domain.id}>{domain.hostname}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select
            disabled={disabled}
            onChange={(event) => onChange({ ...form, status: event.currentTarget.value as CatalogOfferStatus })}
            value={form.status}
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            {mode === 'edit' && <option value="paused">Paused</option>}
            {mode === 'edit' && <option value="archived">Archived</option>}
          </select>
        </label>
        <label className="catalog-field--wide">
          <span>Description</span>
          <textarea
            disabled={disabled}
            maxLength={4000}
            onChange={(event) => onChange({ ...form, description: event.currentTarget.value })}
            rows={3}
            value={form.description}
          />
        </label>
        <label>
          <span>Countries</span>
          <select
            disabled={disabled}
            multiple
            onChange={(event) =>
              onChange({
                ...form,
                countries: Array.from(
                  event.currentTarget.selectedOptions as HTMLCollectionOf<HTMLOptionElement>,
                  (option) => option.value,
                ),
              })
            }
            size={6}
            value={[...form.countries]}
          >
            {COUNTRY_OPTIONS.map(([code, label]) => (
              <option key={code} value={code}>{code} · {label}</option>
            ))}
          </select>
          <small>Use Ctrl/Cmd to select multiple countries. Empty means worldwide.</small>
        </label>
        <label>
          <span>Publishers</span>
          <select
            disabled={disabled}
            multiple
            onChange={(event) =>
              onChange({
                ...form,
                publisherMembershipIds: Array.from(
                  event.currentTarget.selectedOptions as HTMLCollectionOf<HTMLOptionElement>,
                  (option) => option.value,
                ),
              })
            }
            size={6}
            value={[...form.publisherMembershipIds]}
          >
            {publishers.map((publisher) => (
              <option key={publisher.membershipId} value={publisher.membershipId}>
                {publisher.label}
              </option>
            ))}
          </select>
          <span className="catalog-inline-links">
            <button
              disabled={disabled}
              onClick={() => onChange({ ...form, publisherMembershipIds: publishers.map((item) => item.membershipId) })}
              type="button"
            >
              Select all
            </button>
            <button
              disabled={disabled}
              onClick={() => onChange({ ...form, publisherMembershipIds: [] })}
              type="button"
            >
              Unselect all
            </button>
          </span>
        </label>
      </div>

      <CheckboxGrid
        legend="Devices"
        onChange={(values) => onChange({ ...form, devices: values as readonly CatalogDevice[] })}
        options={DEVICE_OPTIONS}
        values={deviceValues}
      />

      <div className="catalog-form-grid catalog-form-grid--three">
        {form.devices.includes('desktop') && (
          <label>
            <span>Desktop URL</span>
            <input
              disabled={disabled}
              onChange={(event) => onChange({ ...form, desktopUrl: event.currentTarget.value })}
              required
              type="url"
              value={form.desktopUrl}
            />
          </label>
        )}
        {form.devices.includes('android') && (
          <label>
            <span>Android URL</span>
            <input
              disabled={disabled}
              onChange={(event) => onChange({ ...form, androidUrl: event.currentTarget.value })}
              required
              type="url"
              value={form.androidUrl}
            />
          </label>
        )}
        {form.devices.includes('ios') && (
          <label>
            <span>iOS URL</span>
            <input
              disabled={disabled}
              onChange={(event) => onChange({ ...form, iosUrl: event.currentTarget.value })}
              required
              type="url"
              value={form.iosUrl}
            />
          </label>
        )}
        <label>
          <span>Redirect type</span>
          <select
            disabled={disabled}
            onChange={(event) => onChange({ ...form, redirectType: event.currentTarget.value as CatalogRedirectType })}
            value={form.redirectType}
          >
            <option value="302">302 Temporary</option>
            <option value="301">301 Permanent</option>
          </select>
        </label>
        <label>
          <span>Referrer</span>
          <select
            disabled={disabled}
            onChange={(event) => onChange({ ...form, referrerMode: event.currentTarget.value as CatalogReferrerMode })}
            value={form.referrerMode}
          >
            <option value="preserve">Preserve referrer</option>
            <option value="strip">Strip referrer</option>
          </select>
        </label>
        <label>
          <span>Payout</span>
          <input
            disabled={disabled}
            min="0"
            onChange={(event) => onChange({ ...form, payoutAmount: event.currentTarget.value })}
            placeholder="0.00"
            step="0.001"
            type="number"
            value={form.payoutAmount}
          />
        </label>
        <label>
          <span>Currency</span>
          <input
            disabled={disabled}
            maxLength={3}
            onChange={(event) => onChange({ ...form, payoutCurrency: event.currentTarget.value.toUpperCase() })}
            pattern="[A-Z]{3}"
            value={form.payoutCurrency}
          />
        </label>
        <label>
          <span>Timezone</span>
          <select
            disabled={disabled}
            onChange={(event) => onChange({ ...form, timezone: event.currentTarget.value })}
            value={form.timezone}
          >
            {TIMEZONE_OPTIONS.map((timezone) => <option key={timezone}>{timezone}</option>)}
          </select>
        </label>
        <label>
          <span>Active from</span>
          <input
            disabled={disabled}
            onChange={(event) => onChange({ ...form, activeStartTime: event.currentTarget.value })}
            type="time"
            value={form.activeStartTime}
          />
        </label>
        <label>
          <span>Active until</span>
          <input
            disabled={disabled}
            onChange={(event) => onChange({ ...form, activeEndTime: event.currentTarget.value })}
            type="time"
            value={form.activeEndTime}
          />
        </label>
        <label>
          <span>Expiry</span>
          <input
            disabled={disabled}
            onChange={(event) => onChange({ ...form, expiresAt: event.currentTarget.value })}
            type="datetime-local"
            value={form.expiresAt}
          />
        </label>
      </div>

      <CheckboxGrid
        legend="Active days"
        onChange={(values) => onChange({ ...form, activeDays: values as readonly number[] })}
        options={DAY_OPTIONS}
        values={dayValues}
      />

      <div className="catalog-toggle-grid">
        <ToggleField
          checked={form.proxyEnabled}
          disabled={disabled}
          hint="Run configured proxy/fraud checks before redirect."
          label="Proxy protection"
          onChange={(proxyEnabled) => onChange({ ...form, proxyEnabled })}
        />
        <ToggleField
          checked={form.duplicateAllowed}
          disabled={disabled}
          hint="Allow duplicate conversion identifiers for this offer."
          label="Allow duplicates"
          onChange={(duplicateAllowed) => onChange({ ...form, duplicateAllowed })}
        />
      </div>

      <div className="catalog-form-actions">
        {onCancel !== undefined && (
          <button className="control-secondary-button" disabled={disabled} onClick={onCancel} type="button">
            Cancel
          </button>
        )}
        <button className="primary-gradient-button primary-gradient-button--compact" disabled={disabled} type="submit">
          <MaterialIcon name={mode === 'create' ? 'add' : 'save'} />
          {mode === 'create' ? 'Add offer' : 'Save offer'}
        </button>
      </div>
    </form>
  );
}

export function OffersPage() {
  const catalog = useCatalogOperations();
  const [form, setForm] = useState<OfferFormState>(() => emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CatalogOfferStatus | 'all'>('all');
  const [networkId, setNetworkId] = useState('');
  const [domainId, setDomainId] = useState('');
  const [publisherId, setPublisherId] = useState('');
  const [country, setCountry] = useState('');
  const [device, setDevice] = useState<CatalogDevice | ''>('');
  const [createdAfter, setCreatedAfter] = useState('');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const snapshot = catalog.snapshot;

  const activeNetworks = useMemo(
    () => snapshot?.networks.filter((item) => item.status === 'active') ?? [],
    [snapshot],
  );
  const activeDomains = useMemo(
    () => snapshot?.domains.filter((item) => item.status === 'active') ?? [],
    [snapshot],
  );
  const activePublishers = useMemo(
    () =>
      snapshot?.publishers
        .filter((item) => item.membershipStatus === 'active' && item.userStatus === 'active')
        .map((item) => ({
          membershipId: item.membershipId,
          label: item.displayName ?? item.email ?? item.membershipId.slice(0, 8),
        })) ?? [],
    [snapshot],
  );

  const filtered = useMemo(() => {
    if (snapshot === null) {
      return [];
    }

    const needle = search.trim().toLowerCase();
    return snapshot.offers.filter((offer) => {
      const matchesSearch =
        needle.length === 0 ||
        offer.name.toLowerCase().includes(needle) ||
        offer.code.toLowerCase().includes(needle) ||
        offer.providerName.toLowerCase().includes(needle) ||
        offer.trackingDomainHostname?.toLowerCase().includes(needle) === true;
      const matchesCreatedAfter =
        createdAfter.length === 0 ||
        new Date(offer.createdAt).getTime() >= new Date(`${createdAfter}T00:00:00`).getTime();

      return (
        matchesSearch &&
        (status === 'all' || offer.status === status) &&
        (networkId.length === 0 || offer.networkAccountId === networkId) &&
        (domainId.length === 0 || offer.trackingDomainId === domainId) &&
        (publisherId.length === 0 || offer.publisherMembershipIds.includes(publisherId)) &&
        (country.length === 0 || offer.countries.includes(country)) &&
        (device === '' || offer.devices.includes(device)) &&
        matchesCreatedAfter
      );
    });
  }, [country, createdAfter, device, domainId, networkId, publisherId, search, snapshot, status]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function resetFeedback() {
    setMessage(null);
    setActionError(null);
  }

  function createInput(current: OfferFormState): CreateCatalogOfferInput {
    const payoutAmount = amountToMinor(current.payoutAmount, current.payoutCurrency);
    return {
      networkAccountId: current.networkAccountId,
      trackingDomainId: current.trackingDomainId,
      code: current.code,
      externalOfferId: current.externalOfferId.trim() || null,
      name: current.name,
      description: current.description.trim() || null,
      countries: current.countries,
      devices: current.devices,
      desktopUrl: current.desktopUrl.trim() || null,
      androidUrl: current.androidUrl.trim() || null,
      iosUrl: current.iosUrl.trim() || null,
      redirectType: current.redirectType,
      referrerMode: current.referrerMode,
      defaultPayoutAmountMinor: payoutAmount,
      payoutCurrency: payoutAmount === null ? null : current.payoutCurrency,
      timezone: current.timezone,
      activeDays: current.activeDays,
      activeStartTime: current.activeStartTime || null,
      activeEndTime: current.activeEndTime || null,
      proxyEnabled: current.proxyEnabled,
      expiresAt: current.expiresAt.length === 0 ? null : new Date(current.expiresAt).toISOString(),
      duplicateAllowed: current.duplicateAllowed,
      publisherMembershipIds: current.publisherMembershipIds,
      status: current.status === 'active' ? 'active' : 'draft',
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();

    try {
      const input = createInput(form);
      if (editingId === null) {
        await catalog.createOffer(input);
        setMessage(`${form.name.trim()} was added.`);
      } else {
        await catalog.updateOffer({
          ...input,
          offerId: editingId,
          status: form.status,
        });
        setMessage(`${form.name.trim()} was updated.`);
      }
      setForm(emptyForm());
      setEditingId(null);
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'The offer could not be saved.');
    }
  }

  function editOffer(offer: CatalogOffer) {
    resetFeedback();
    setEditingId(offer.id);
    setForm(formFromOffer(offer));
    document.querySelector('.catalog-editor-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function duplicateOffer(offer: CatalogOffer) {
    const suffix = Date.now().toString(36).slice(-5);
    const baseCode = offer.code.slice(0, Math.max(2, 74 - suffix.length));

    resetFeedback();
    setEditingId(null);
    setForm({
      ...formFromOffer(offer),
      code: `${baseCode}-copy-${suffix}`,
      externalOfferId: '',
      name: `${offer.name} Copy`,
      status: 'draft',
    });
    document.querySelector('.catalog-editor-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (!catalog.permissions.canReadCatalog) {
    return <ControlAccessDenied title="Offer access unavailable" message="Manager or Company Administrator access is required." />;
  }

  if (catalog.isLoading || snapshot === null) {
    return <ControlLoading label="offers" />;
  }

  return (
    <div className="page-stack catalog-page">
      <ControlModuleHeader
        description="Create targeted offers, map verified domains and networks, assign Publishers, and manage routing, payout, schedule, proxy, and expiry controls."
        eyebrow="Offer Setup"
        icon="local_offer"
        stats={[
          { label: 'Total', value: snapshot.summary.offers },
          { label: 'Active', value: snapshot.offers.filter((offer) => offer.status === 'active').length },
          { label: 'Publishers', value: snapshot.summary.publishers },
        ]}
        title="Offers"
      />

      <ControlFeedback error={actionError ?? catalog.error} message={message} />

      {catalog.permissions.canManageCatalog && (
        <GlassPanel as="section" className="control-card catalog-editor-panel">
          <ControlCardHeading
            eyebrow={editingId === null ? 'Add Offer' : 'Edit Offer'}
            title={editingId === null ? 'Create a complete operational offer' : `Update ${form.name}`}
            description="All reference fields are persisted through the company catalog API."
          />
          {activeNetworks.length === 0 || activeDomains.length === 0 ? (
            <ControlEmpty
              icon="warning"
              title="Network and verified domain required"
              message="Create an active network and verify at least one tracking domain before adding an offer."
            />
          ) : (
            <OfferForm
              disabled={catalog.isMutating}
              domains={activeDomains}
              form={form}
              mode={editingId === null ? 'create' : 'edit'}
              networks={activeNetworks}
              onCancel={editingId === null ? undefined : () => { setEditingId(null); setForm(emptyForm()); }}
              onChange={setForm}
              onSubmit={(event) => void handleSubmit(event)}
              publishers={activePublishers}
            />
          )}
        </GlassPanel>
      )}

      <GlassPanel as="section" className="control-card catalog-table-panel">
        <ControlCardHeading
          action={<RefreshButton disabled={catalog.isRefreshing} onClick={() => void catalog.refresh()} />}
          eyebrow="Offer Directory"
          title="Available offers"
          description="Search and filter live offer records."
        />
        <CatalogToolbar
          onSearch={(value) => {
            setSearch(value);
            setPage(1);
          }}
          search={search}
        >
          <select
            onChange={(event) => {
              setStatus(event.currentTarget.value as CatalogOfferStatus | 'all');
              setPage(1);
            }}
            value={status}
          >
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="archived">Archived</option>
          </select>
          <select
            onChange={(event) => {
              setNetworkId(event.currentTarget.value);
              setPage(1);
            }}
            value={networkId}
          >
            <option value="">All networks</option>
            {snapshot.networks.map((network) => <option key={network.id} value={network.id}>{network.name}</option>)}
          </select>
          <select
            onChange={(event) => {
              setDomainId(event.currentTarget.value);
              setPage(1);
            }}
            value={domainId}
          >
            <option value="">All domains</option>
            {snapshot.domains.map((domain) => <option key={domain.id} value={domain.id}>{domain.hostname}</option>)}
          </select>
          <select
            onChange={(event) => {
              setPublisherId(event.currentTarget.value);
              setPage(1);
            }}
            value={publisherId}
          >
            <option value="">All publishers</option>
            {snapshot.publishers.map((publisher) => (
              <option key={publisher.membershipId} value={publisher.membershipId}>
                {publisher.displayName ?? publisher.email ?? publisher.membershipId.slice(0, 8)}
              </option>
            ))}
          </select>
          <select
            onChange={(event) => {
              setCountry(event.currentTarget.value);
              setPage(1);
            }}
            value={country}
          >
            <option value="">All countries</option>
            {COUNTRY_OPTIONS.map(([code, label]) => <option key={code} value={code}>{code} · {label}</option>)}
          </select>
          <select
            onChange={(event) => {
              setDevice(event.currentTarget.value as CatalogDevice | '');
              setPage(1);
            }}
            value={device}
          >
            <option value="">All devices</option>
            {DEVICE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <input
            aria-label="Offers added after"
            onChange={(event) => {
              setCreatedAfter(event.currentTarget.value);
              setPage(1);
            }}
            type="date"
            value={createdAfter}
          />
        </CatalogToolbar>

        {pageRows.length === 0 ? (
          <ControlEmpty icon="local_offer" title="No offers found" message="Create an offer or change the filters." />
        ) : (
          <div className="responsive-table catalog-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Offer</th>
                  <th>Domain</th>
                  <th>Network</th>
                  <th>Publishers</th>
                  <th>Clicks</th>
                  <th>Conversions</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((offer) => (
                  <tr key={offer.id}>
                    <td><strong>{offer.name}</strong><small>{offer.code}</small></td>
                    <td>{offer.trackingDomainHostname ?? 'Not configured'}</td>
                    <td>{offer.networkAccountName}<small>{offer.providerName}</small></td>
                    <td>{offer.publisherMembershipIds.length}</td>
                    <td>{offer.clicks.toLocaleString()}</td>
                    <td>{offer.conversions.toLocaleString()}</td>
                    <td><ControlStatus status={offer.status} /></td>
                    <td>{formatDateTime(offer.updatedAt)}</td>
                    <td>
                      <RowActions>
                        {catalog.permissions.canManageCatalog && offer.status !== 'archived' && (
                          <button aria-label={`Edit ${offer.name}`} onClick={() => editOffer(offer)} title="Edit" type="button">
                            <MaterialIcon name="edit" />
                          </button>
                        )}
                        {catalog.permissions.canManageCatalog && (
                          <button aria-label={`Duplicate ${offer.name}`} onClick={() => duplicateOffer(offer)} title="Duplicate" type="button">
                            <MaterialIcon name="content_copy" />
                          </button>
                        )}
                        <a aria-label={`Open ${offer.name} destination`} href={offer.destinationUrl} rel="noreferrer" target="_blank" title="View destination">
                          <MaterialIcon name="visibility" />
                        </a>
                      </RowActions>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <CatalogPagination onPage={setPage} page={safePage} pageCount={pageCount} />
      </GlassPanel>
    </div>
  );
}
