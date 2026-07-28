import { type FormEvent, useMemo, useState } from 'react';

import { MaterialIcon } from '../../components/icons/material-icon';
import { GlassPanel } from '../../components/ui/glass-panel';
import {
  COUNTRY_OPTIONS,
  DAY_OPTIONS,
  TIMEZONE_OPTIONS,
} from '../../features/catalog/catalog-options';
import type {
  CatalogDevice,
  CatalogOffer,
  CatalogOfferStatus,
  CatalogRedirectType,
  CatalogReferrerMode,
  CreateCatalogOfferInput,
  UpdateCatalogOfferInput,
} from '../../features/catalog/catalog.types';
import { useCatalogOperations } from '../../features/catalog/use-catalog';
import {
  CatalogPagination,
  CatalogToolbar,
  CheckboxGrid,
  MultiSelectDropdown,
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

const PAGE_SIZE = 8;
const DEVICE_OPTIONS = [
  ['desktop', 'Desktop'],
  ['android', 'Android'],
  ['ios', 'iOS'],
] as const;

export type OffersPageMode = 'add' | 'manage';

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
  managerMembershipIds: readonly string[];
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
    managerMembershipIds: [],
    status: 'draft',
  };
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

function createOfferCode(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 62);
  const suffix = Date.now().toString(36).slice(-7);

  return `${normalized.length > 0 ? normalized : 'offer'}-${suffix}`;
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
    managerMembershipIds: offer.managerMembershipIds,
    status: offer.status,
  };
}

function trackingOrigin(hostname: string | undefined): string {
  if (hostname === undefined || hostname.length === 0) {
    return 'https://example.com';
  }

  return hostname.startsWith('http://') || hostname.startsWith('https://')
    ? hostname.replace(/\/$/u, '')
    : `https://${hostname}`;
}

function OfferForm({
  form,
  mode,
  disabled,
  networks,
  domains,
  managers,
  publicOfferId,
  onChange,
  onSubmit,
  onCancel,
}: {
  form: OfferFormState;
  mode: 'create' | 'edit';
  disabled: boolean;
  networks: readonly { id: string; name: string; providerName: string }[];
  domains: readonly { id: string; hostname: string }[];
  managers: readonly { membershipId: string; label: string; publicId: number }[];
  publicOfferId: number | null;
  onChange: (form: OfferFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
}) {
  const deviceValues = form.devices as readonly (string | number)[];
  const dayValues = form.activeDays as readonly (string | number)[];
  const selectedDomain = domains.find((domain) => domain.id === form.trackingDomainId);
  const linkOrigin = trackingOrigin(selectedDomain?.hostname);
  const exampleOfferId = publicOfferId ?? 890;
  const exampleTrackingLink = `${linkOrigin}/pub_id=1234?offer_id=${exampleOfferId}`;
  const trackingTemplate = `${linkOrigin}/pub_id={publisher_id}?offer_id=${
    publicOfferId === null ? '{offer_id}' : publicOfferId
  }`;

  return (
    <form className="catalog-form company-admin-offer-form" onSubmit={onSubmit}>
      <div className="catalog-form-section-heading">
        <MaterialIcon name="local_offer" />
        <div>
          <strong>Offer identity and assignment</strong>
          <small>Company Admin assigns Offers to Managers. Managers later assign only these Offers to Publishers.</small>
        </div>
      </div>

      <div className="catalog-form-grid catalog-form-grid--three">
        <label>
          <span>Name</span>
          <input
            disabled={disabled}
            maxLength={160}
            onChange={(event) => onChange({ ...form, name: event.currentTarget.value })}
            placeholder="Offer name"
            required
            value={form.name}
          />
        </label>
        <label>
          <span>Domain</span>
          <select
            disabled={disabled}
            onChange={(event) => onChange({ ...form, trackingDomainId: event.currentTarget.value })}
            required
            value={form.trackingDomainId}
          >
            <option value="">Select active Domain</option>
            {domains.map((domain) => (
              <option key={domain.id} value={domain.id}>{domain.hostname}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Network</span>
          <select
            disabled={disabled || mode === 'edit'}
            onChange={(event) => onChange({ ...form, networkAccountId: event.currentTarget.value })}
            required
            value={form.networkAccountId}
          >
            <option value="">Select active Network</option>
            {networks.map((network) => (
              <option key={network.id} value={network.id}>
                {network.name} Â· {network.providerName}
              </option>
            ))}
          </select>
        </label>
        <div className="catalog-field catalog-field--wide">
          <span>Managers</span>
          <MultiSelectDropdown
            ariaLabel="Select active Managers"
            disabled={disabled}
            emptyMessage="No active Managers are available."
            onChange={(managerMembershipIds) =>
              onChange({
                ...form,
                managerMembershipIds,
              })
            }
            options={managers.map((manager) => [
              manager.membershipId,
              `${manager.label} · Manager #${manager.publicId}`,
            ] as const)}
            placeholder="Select active Managers"
            searchPlaceholder="Search Managers"
            values={form.managerMembershipIds}
          />
          <small>Assign this Offer to one or more active Managers.</small>
        </div>
        <label className="catalog-field--wide">
          <span>Description</span>
          <textarea
            disabled={disabled}
            maxLength={4000}
            onChange={(event) => onChange({ ...form, description: event.currentTarget.value })}
            placeholder="Optional internal Offer notes"
            rows={3}
            value={form.description}
          />
        </label>
        <label>
          <span>Status</span>
          <select
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...form,
                status: event.currentTarget.value as CatalogOfferStatus,
              })
            }
            value={form.status}
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            {mode === 'edit' && <option value="paused">Paused</option>}
            {mode === 'edit' && <option value="archived">Archived</option>}
          </select>
        </label>
      </div>

      <div className="catalog-form-section-heading">
        <MaterialIcon name="public" />
        <div>
          <strong>Countries and devices</strong>
          <small>Select targeting and paste the affiliate Network URL separately for every selected device.</small>
        </div>
      </div>

      <div className="catalog-form-grid catalog-form-grid--two">
        <div className="catalog-field">
          <span>Countries</span>
          <MultiSelectDropdown
            ariaLabel="Select target countries"
            disabled={disabled}
            emptyMessage="No countries match your search."
            onChange={(countries) =>
              onChange({
                ...form,
                countries,
              })
            }
            options={COUNTRY_OPTIONS}
            placeholder="Worldwide — all countries"
            searchPlaceholder="Search countries"
            values={form.countries}
          />
          <small>No selected country means worldwide traffic.</small>
        </div>
        <CheckboxGrid
          legend="Devices"
          onChange={(values) =>
            onChange({
              ...form,
              devices: values as readonly CatalogDevice[],
              desktopUrl: values.includes('desktop') ? form.desktopUrl : '',
              androidUrl: values.includes('android') ? form.androidUrl : '',
              iosUrl: values.includes('ios') ? form.iosUrl : '',
            })
          }
          options={DEVICE_OPTIONS}
          values={deviceValues}
        />
      </div>

      <div className="catalog-form-grid catalog-form-grid--three device-destination-grid">
        {form.devices.includes('desktop') && (
          <label>
            <span>Desktop affiliate Network URL</span>
            <input
              disabled={disabled}
              onChange={(event) => onChange({ ...form, desktopUrl: event.currentTarget.value })}
              placeholder="https://affiliate.example/desktop"
              required
              type="url"
              value={form.desktopUrl}
            />
          </label>
        )}
        {form.devices.includes('android') && (
          <label>
            <span>Android affiliate Network URL</span>
            <input
              disabled={disabled}
              onChange={(event) => onChange({ ...form, androidUrl: event.currentTarget.value })}
              placeholder="https://affiliate.example/android"
              required
              type="url"
              value={form.androidUrl}
            />
          </label>
        )}
        {form.devices.includes('ios') && (
          <label>
            <span>iOS affiliate Network URL</span>
            <input
              disabled={disabled}
              onChange={(event) => onChange({ ...form, iosUrl: event.currentTarget.value })}
              placeholder="https://affiliate.example/ios"
              required
              type="url"
              value={form.iosUrl}
            />
          </label>
        )}
      </div>

      <div className="catalog-form-section-heading">
        <MaterialIcon name="link" />
        <div>
          <strong>Tracking Link</strong>
          <small>Tracking Links are generated from the selected Domain, Publisher public ID, and Offer public ID.</small>
        </div>
      </div>

      <div className="offer-tracking-link-panel">
        <div>
          <span>Required generated shape</span>
          <code>{exampleTrackingLink}</code>
        </div>
        <div>
          <span>Runtime template</span>
          <code>{trackingTemplate}</code>
        </div>
        <p>
          The Manager will assign this Offer to a Publisher. The system then inserts that Publisher&apos;s numeric public ID. Direct ID changes are rejected unless the Manager â†’ Offer â†’ Publisher assignment is active.
        </p>
      </div>

      <div className="catalog-form-section-heading">
        <MaterialIcon name="route" />
        <div>
          <strong>Routing, payout, schedule, and fraud controls</strong>
          <small>These settings belong to the Offer and are not separate modules.</small>
        </div>
      </div>

      <div className="catalog-form-grid catalog-form-grid--three">
        <label>
          <span>Redirect</span>
          <select
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...form,
                redirectType: event.currentTarget.value as CatalogRedirectType,
              })
            }
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
            onChange={(event) =>
              onChange({
                ...form,
                referrerMode: event.currentTarget.value as CatalogReferrerMode,
              })
            }
            value={form.referrerMode}
          >
            <option value="preserve">Preserve</option>
            <option value="strip">Hide / strip</option>
          </select>
        </label>
        <label>
          <span>Timezone</span>
          <select
            disabled={disabled}
            onChange={(event) => onChange({ ...form, timezone: event.currentTarget.value })}
            value={form.timezone}
          >
            {TIMEZONE_OPTIONS.map((timezone) => (
              <option key={timezone} value={timezone}>{timezone}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Fixed payout amount</span>
          <input
            disabled={disabled}
            inputMode="decimal"
            min="0.01"
            onChange={(event) => onChange({ ...form, payoutAmount: event.currentTarget.value })}
            placeholder="0.00"
            step="0.01"
            type="number"
            value={form.payoutAmount}
          />
        </label>
        <label>
          <span>Payout currency</span>
          <input
            disabled={disabled}
            maxLength={3}
            minLength={3}
            onChange={(event) =>
              onChange({
                ...form,
                payoutCurrency: event.currentTarget.value.toUpperCase(),
              })
            }
            pattern="[A-Z]{3}"
            value={form.payoutCurrency}
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
        onChange={(values) =>
          onChange({
            ...form,
            activeDays: values.map(Number),
          })
        }
        options={DAY_OPTIONS}
        values={dayValues}
      />

      <div className="catalog-form-grid catalog-form-grid--two">
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
      </div>

      <div className="offer-inline-toggles">
        <ToggleField
          checked={form.proxyEnabled}
          disabled={disabled}
          hint="Enable the configured proxy route for this Offer."
          label="Proxy"
          onChange={(proxyEnabled) => onChange({ ...form, proxyEnabled })}
        />
        <ToggleField
          checked={form.duplicateAllowed}
          disabled={disabled}
          hint="Fraud control: allow or block repeated attribution identifiers."
          label="Allow duplicate traffic"
          onChange={(duplicateAllowed) => onChange({ ...form, duplicateAllowed })}
        />
      </div>

      <div className="catalog-form-actions">
        {onCancel !== undefined && (
          <button
            className="control-secondary-button"
            disabled={disabled}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
        )}
        <button
          className="primary-gradient-button primary-gradient-button--compact"
          disabled={disabled}
          type="submit"
        >
          <MaterialIcon name={mode === 'create' ? 'add' : 'save'} />
          {mode === 'create' ? 'Add Offer' : 'Save Offer'}
        </button>
      </div>
    </form>
  );
}

function updateInputFromOffer(
  offer: CatalogOffer,
  status: CatalogOfferStatus,
): UpdateCatalogOfferInput {
  if (offer.trackingDomainId === null) {
    throw new Error('The Offer requires an active tracking Domain before its status can change.');
  }

  return {
    offerId: offer.id,
    trackingDomainId: offer.trackingDomainId,
    externalOfferId: offer.externalOfferId,
    name: offer.name,
    description: offer.description,
    status,
    countries: offer.countries,
    devices: offer.devices,
    desktopUrl: offer.desktopUrl,
    androidUrl: offer.androidUrl,
    iosUrl: offer.iosUrl,
    redirectType: offer.redirectType,
    referrerMode: offer.referrerMode,
    defaultPayoutAmountMinor: offer.defaultPayoutAmountMinor,
    payoutCurrency: offer.payoutCurrency,
    timezone: offer.timezone,
    activeDays: offer.activeDays,
    activeStartTime: offer.activeStartTime,
    activeEndTime: offer.activeEndTime,
    proxyEnabled: offer.proxyEnabled,
    expiresAt: offer.expiresAt,
    duplicateAllowed: offer.duplicateAllowed,
    managerMembershipIds: offer.managerMembershipIds,
  };
}

export function OffersPage({ mode }: { mode: OffersPageMode }) {
  const catalog = useCatalogOperations();
  const [form, setForm] = useState<OfferFormState>(() => emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CatalogOfferStatus | 'all'>('all');
  const [networkId, setNetworkId] = useState('');
  const [domainId, setDomainId] = useState('');
  const [managerId, setManagerId] = useState('');
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
  const activeManagers = useMemo(
    () =>
      snapshot?.managers
        .filter(
          (item) => item.membershipStatus === 'active' && item.userStatus === 'active',
        )
        .map((item) => ({
          membershipId: item.membershipId,
          publicId: item.publicId,
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
        offer.publicId.toString().includes(needle) ||
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
        (managerId.length === 0 || offer.managerMembershipIds.includes(managerId)) &&
        (country.length === 0 || offer.countries.includes(country)) &&
        (device === '' || offer.devices.includes(device)) &&
        matchesCreatedAfter
      );
    });
  }, [country, createdAfter, device, domainId, managerId, networkId, search, snapshot, status]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const editorVisible = mode === 'add' || editorOpen;
  const editingOffer =
    editingId === null ? null : snapshot?.offers.find((offer) => offer.id === editingId) ?? null;

  function resetFeedback(): void {
    setMessage(null);
    setActionError(null);
  }

  function closeEditor(): void {
    setEditingId(null);
    setEditorOpen(false);
    setForm(emptyForm());
  }

  function createInput(current: OfferFormState): CreateCatalogOfferInput {
    if (current.devices.length === 0) {
      throw new Error('Select at least one device.');
    }

    if (current.activeDays.length === 0) {
      throw new Error('Select at least one active day.');
    }

    if (current.managerMembershipIds.length === 0) {
      throw new Error('Assign the Offer to at least one active Manager.');
    }

    const payoutAmount = amountToMinor(current.payoutAmount, current.payoutCurrency);

    return {
      networkAccountId: current.networkAccountId,
      trackingDomainId: current.trackingDomainId,
      code: current.code.length > 0 ? current.code : createOfferCode(current.name),
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
      expiresAt:
        current.expiresAt.length === 0 ? null : new Date(current.expiresAt).toISOString(),
      duplicateAllowed: current.duplicateAllowed,
      managerMembershipIds: current.managerMembershipIds,
      status: current.status === 'active' ? 'active' : 'draft',
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    resetFeedback();

    try {
      const input = createInput(form);

      if (editingId === null) {
        await catalog.createOffer(input);
        setMessage(`${form.name.trim()} was added and assigned to its Managers.`);
      } else {
        await catalog.updateOffer({
          ...input,
          offerId: editingId,
          status: form.status,
        });
        setMessage(`${form.name.trim()} was updated.`);
      }

      closeEditor();
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'The Offer could not be saved.');
    }
  }

  function editOffer(offer: CatalogOffer): void {
    resetFeedback();
    setEditingId(offer.id);
    setForm(formFromOffer(offer));
    setEditorOpen(true);
    document.querySelector('.catalog-editor-panel')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  function cloneOffer(offer: CatalogOffer): void {
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
    setEditorOpen(true);
    document.querySelector('.catalog-editor-panel')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  async function updateOfferStatus(
    offer: CatalogOffer,
    nextStatus: CatalogOfferStatus,
  ): Promise<void> {
    resetFeedback();

    try {
      await catalog.updateOffer(updateInputFromOffer(offer, nextStatus));
      setMessage(
        nextStatus === 'active'
          ? `${offer.name} is active.`
          : nextStatus === 'paused'
            ? `${offer.name} is paused.`
            : `${offer.name} was archived.`,
      );
    } catch (error: unknown) {
      setActionError(
        error instanceof Error ? error.message : 'The Offer status could not be updated.',
      );
    }
  }

  if (!catalog.permissions.canReadCatalog) {
    return (
      <ControlAccessDenied
        message="Company Administrator access is required."
        title="Offer access unavailable"
      />
    );
  }

  if (catalog.isLoading || snapshot === null) {
    return <ControlLoading label="Offers" />;
  }

  return (
    <div className="page-stack catalog-page company-admin-offers-page">
      <ControlModuleHeader
        description={
          mode === 'add'
            ? 'Create a complete Offer, assign it to Managers, and configure tracking, payout, schedule, proxy, and fraud behavior in one place.'
            : 'Edit, clone, activate, pause, or archive every company Offer.'
        }
        eyebrow="Offer Operations"
        icon="local_offer"
        stats={[
          { label: 'Total', value: snapshot.summary.offers },
          {
            label: 'Active',
            value: snapshot.offers.filter((offer) => offer.status === 'active').length,
          },
          { label: 'Managers', value: snapshot.summary.managers },
        ]}
        title={mode === 'add' ? 'Add Offer' : 'Manage Offers'}
      />

      <ControlFeedback error={actionError ?? catalog.error} message={message} />

      {catalog.permissions.canManageCatalog && editorVisible && (
        <GlassPanel as="section" className="control-card catalog-editor-panel">
          <ControlCardHeading
            description="Tracking Link, payout, and fraud controls are embedded in this Offer form."
            eyebrow={editingId === null ? 'Add Offer' : 'Edit Offer'}
            title={editingId === null ? 'Create a complete operational Offer' : `Update ${form.name}`}
          />
          {activeNetworks.length === 0 || activeDomains.length === 0 || activeManagers.length === 0 ? (
            <ControlEmpty
              icon="warning"
              message="Create an active Network, activate a verified Domain, and invite at least one active Manager before adding an Offer."
              title="Network, Domain, and Manager required"
            />
          ) : (
            <OfferForm
              disabled={catalog.isMutating}
              domains={activeDomains}
              form={form}
              managers={activeManagers}
              mode={editingId === null ? 'create' : 'edit'}
              networks={activeNetworks}
              onCancel={mode === 'manage' ? closeEditor : undefined}
              onChange={setForm}
              onSubmit={(event) => void handleSubmit(event)}
              publicOfferId={editingOffer?.publicId ?? null}
            />
          )}
        </GlassPanel>
      )}

      {mode === 'manage' && (
        <GlassPanel as="section" className="control-card catalog-table-panel">
          <ControlCardHeading
            action={
              <RefreshButton
                disabled={catalog.isRefreshing}
                onClick={() => void catalog.refresh()}
              />
            }
            description="Search, filter, and manage live Offer records."
            eyebrow="Offer Directory"
            title="Manage Offers"
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
              <option value="">All Networks</option>
              {snapshot.networks.map((network) => (
                <option key={network.id} value={network.id}>{network.name}</option>
              ))}
            </select>
            <select
              onChange={(event) => {
                setDomainId(event.currentTarget.value);
                setPage(1);
              }}
              value={domainId}
            >
              <option value="">All Domains</option>
              {snapshot.domains.map((domain) => (
                <option key={domain.id} value={domain.id}>{domain.hostname}</option>
              ))}
            </select>
            <select
              onChange={(event) => {
                setManagerId(event.currentTarget.value);
                setPage(1);
              }}
              value={managerId}
            >
              <option value="">All Managers</option>
              {snapshot.managers.map((manager) => (
                <option key={manager.membershipId} value={manager.membershipId}>
                  {manager.displayName ?? manager.email ?? manager.membershipId.slice(0, 8)}
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
              {COUNTRY_OPTIONS.map(([code, label]) => (
                <option key={code} value={code}>{code} Â· {label}</option>
              ))}
            </select>
            <select
              onChange={(event) => {
                setDevice(event.currentTarget.value as CatalogDevice | '');
                setPage(1);
              }}
              value={device}
            >
              <option value="">All devices</option>
              {DEVICE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
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
            <ControlEmpty
              icon="local_offer"
              message="Create an Offer or change the filters."
              title="No Offers found"
            />
          ) : (
            <div className="responsive-table catalog-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Domain</th>
                    <th>Network</th>
                    <th>Clicks</th>
                    <th>Conversions</th>
                    <th>Status</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((offer) => (
                    <tr key={offer.id}>
                      <td><strong>{offer.publicId}</strong></td>
                      <td>
                        <strong>{offer.name}</strong>
                        <small>{offer.managerMembershipIds.length} Manager assignment(s)</small>
                      </td>
                      <td>{offer.trackingDomainHostname ?? 'Not configured'}</td>
                      <td>
                        {offer.networkAccountName}
                        <small>{offer.providerName}</small>
                      </td>
                      <td>{offer.clicks.toLocaleString()}</td>
                      <td>{offer.conversions.toLocaleString()}</td>
                      <td><ControlStatus status={offer.status} /></td>
                      <td>
                        <RowActions>
                          {catalog.permissions.canManageCatalog && offer.status !== 'archived' && (
                            <button
                              aria-label={`Edit ${offer.name}`}
                              onClick={() => editOffer(offer)}
                              title="Edit"
                              type="button"
                            >
                              <MaterialIcon name="edit" />
                            </button>
                          )}
                          {catalog.permissions.canManageCatalog && (
                            <button
                              aria-label={`Clone ${offer.name}`}
                              onClick={() => cloneOffer(offer)}
                              title="Clone"
                              type="button"
                            >
                              <MaterialIcon name="content_copy" />
                            </button>
                          )}
                          {catalog.permissions.canManageCatalog && offer.status !== 'active' && offer.status !== 'archived' && (
                            <button
                              aria-label={`Activate ${offer.name}`}
                              onClick={() => void updateOfferStatus(offer, 'active')}
                              title="Activate"
                              type="button"
                            >
                              <MaterialIcon name="play_arrow" />
                            </button>
                          )}
                          {catalog.permissions.canManageCatalog && offer.status === 'active' && (
                            <button
                              aria-label={`Pause ${offer.name}`}
                              onClick={() => void updateOfferStatus(offer, 'paused')}
                              title="Pause"
                              type="button"
                            >
                              <MaterialIcon name="pause" />
                            </button>
                          )}
                          {catalog.permissions.canManageCatalog && offer.status !== 'archived' && (
                            <button
                              aria-label={`Delete ${offer.name}`}
                              onClick={() => void updateOfferStatus(offer, 'archived')}
                              title="Delete / archive"
                              type="button"
                            >
                              <MaterialIcon name="delete" />
                            </button>
                          )}
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
      )}
    </div>
  );
}

