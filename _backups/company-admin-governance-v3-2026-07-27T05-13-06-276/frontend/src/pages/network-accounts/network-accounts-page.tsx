import { type FormEvent, useMemo, useState } from 'react';

import { MaterialIcon } from '../../components/icons/material-icon';
import { GlassPanel } from '../../components/ui/glass-panel';
import type {
  CatalogNetwork,
  CatalogNetworkStatus,
  CreateCatalogNetworkInput,
} from '../../features/catalog/catalog.types';
import { useCatalogOperations } from '../../features/catalog/use-catalog';
import {
  CatalogPagination,
  CatalogToolbar,
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

const PAGE_SIZE = 10;

type NetworkFormState = {
  providerId: string;
  name: string;
  externalAccountId: string;
  trackingParameter: string;
  postbackUrl: string;
  duplicateAllowed: boolean;
  status: CatalogNetworkStatus;
};

function emptyForm(): NetworkFormState {
  return {
    providerId: '',
    name: '',
    externalAccountId: '',
    trackingParameter: '',
    postbackUrl: '',
    duplicateAllowed: false,
    status: 'active',
  };
}

function formFromNetwork(network: CatalogNetwork): NetworkFormState {
  return {
    providerId: network.providerId,
    name: network.name,
    externalAccountId: network.externalAccountId ?? '',
    trackingParameter: network.trackingParameter ?? '',
    postbackUrl: network.postbackUrl ?? '',
    duplicateAllowed: network.duplicateAllowed,
    status: network.status,
  };
}

function NetworkForm({
  form,
  mode,
  providers,
  disabled,
  onChange,
  onSubmit,
  onCancel,
}: {
  form: NetworkFormState;
  mode: 'create' | 'edit';
  providers: readonly { id: string; code: string; name: string }[];
  disabled: boolean;
  onChange: (form: NetworkFormState) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
}) {
  const selectedProvider = providers.find((provider) => provider.id === form.providerId);
  const customProvider = selectedProvider?.code === 'custom';

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
          <span>Software / provider</span>
          <select
            disabled={disabled || mode === 'edit'}
            onChange={(event) => onChange({ ...form, providerId: event.currentTarget.value })}
            required
            value={form.providerId}
          >
            <option value="">Select provider</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>External account ID</span>
          <input
            autoComplete="off"
            disabled={disabled}
            onChange={(event) => onChange({ ...form, externalAccountId: event.currentTarget.value })}
            value={form.externalAccountId}
          />
        </label>
        <label>
          <span>Tracking parameter</span>
          <input
            disabled={disabled}
            onChange={(event) => onChange({ ...form, trackingParameter: event.currentTarget.value })}
            placeholder={customProvider ? 'aff_click_id' : 'Optional account default'}
            value={form.trackingParameter}
          />
        </label>
        <label className="catalog-field--wide">
          <span>Postback URL</span>
          <input
            disabled={disabled}
            onChange={(event) => onChange({ ...form, postbackUrl: event.currentTarget.value })}
            placeholder="https://network.example/postback?click_id={click_id}"
            type="url"
            value={form.postbackUrl}
          />
          {customProvider && <small>Custom providers require their tracking parameter and postback convention.</small>}
        </label>
        {mode === 'edit' && (
          <label>
            <span>Status</span>
            <select
              disabled={disabled}
              onChange={(event) => onChange({ ...form, status: event.currentTarget.value as CatalogNetworkStatus })}
              value={form.status}
            >
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        )}
      </div>
      <ToggleField
        checked={form.duplicateAllowed}
        disabled={disabled}
        hint="Allow repeated provider-side conversion identifiers for this network."
        label="Allow duplicate conversions"
        onChange={(duplicateAllowed) => onChange({ ...form, duplicateAllowed })}
      />
      <div className="catalog-form-actions">
        {onCancel !== undefined && (
          <button className="control-secondary-button" disabled={disabled} onClick={onCancel} type="button">
            Cancel
          </button>
        )}
        <button className="primary-gradient-button primary-gradient-button--compact" disabled={disabled} type="submit">
          <MaterialIcon name={mode === 'create' ? 'add' : 'save'} />
          {mode === 'create' ? 'Add network' : 'Save network'}
        </button>
      </div>
    </form>
  );
}

export function NetworkAccountsPage() {
  const catalog = useCatalogOperations();
  const [form, setForm] = useState<NetworkFormState>(() => emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CatalogNetworkStatus | 'all'>('all');
  const [providerId, setProviderId] = useState('');
  const [createdAfter, setCreatedAfter] = useState('');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const snapshot = catalog.snapshot;

  const providers = useMemo(
    () => snapshot?.providers.filter((provider) => provider.status === 'active') ?? [],
    [snapshot],
  );

  const filtered = useMemo(() => {
    if (snapshot === null) {
      return [];
    }

    const needle = search.trim().toLowerCase();
    return snapshot.networks.filter((network) => {
      const matchesSearch =
        needle.length === 0 ||
        network.name.toLowerCase().includes(needle) ||
        network.providerName.toLowerCase().includes(needle) ||
        network.providerCode.toLowerCase().includes(needle) ||
        network.externalAccountId?.toLowerCase().includes(needle) === true;
      const matchesCreatedAfter =
        createdAfter.length === 0 ||
        new Date(network.createdAt).getTime() >= new Date(`${createdAfter}T00:00:00`).getTime();

      return (
        matchesSearch &&
        (status === 'all' || network.status === status) &&
        (providerId.length === 0 || network.providerId === providerId) &&
        matchesCreatedAfter
      );
    });
  }, [createdAfter, providerId, search, snapshot, status]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function resetFeedback() {
    setMessage(null);
    setActionError(null);
  }

  function createInput(current: NetworkFormState): CreateCatalogNetworkInput {
    return {
      providerId: current.providerId,
      name: current.name,
      externalAccountId: current.externalAccountId.trim() || null,
      trackingParameter: current.trackingParameter.trim() || null,
      postbackUrl: current.postbackUrl.trim() || null,
      duplicateAllowed: current.duplicateAllowed,
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();

    try {
      if (editingId === null) {
        await catalog.createNetwork(createInput(form));
        setMessage(`${form.name.trim()} was added.`);
      } else {
        await catalog.updateNetwork({
          accountId: editingId,
          name: form.name,
          externalAccountId: form.externalAccountId.trim() || null,
          status: form.status,
          trackingParameter: form.trackingParameter.trim() || null,
          postbackUrl: form.postbackUrl.trim() || null,
          duplicateAllowed: form.duplicateAllowed,
        });
        setMessage(`${form.name.trim()} was updated.`);
      }
      setEditingId(null);
      setForm(emptyForm());
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'The network could not be saved.');
    }
  }

  function editNetwork(network: CatalogNetwork) {
    resetFeedback();
    setEditingId(network.id);
    setForm(formFromNetwork(network));
    document.querySelector('.catalog-editor-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function duplicateNetwork(network: CatalogNetwork) {
    const suffix = Date.now().toString(36).slice(-5);

    resetFeedback();
    setEditingId(null);
    setForm({
      ...formFromNetwork(network),
      name: `${network.name} Copy ${suffix}`,
      externalAccountId: '',
      status: 'active',
    });
    document.querySelector('.catalog-editor-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (!catalog.permissions.canReadCatalog) {
    return <ControlAccessDenied title="Network access unavailable" message="Manager or Company Administrator access is required." />;
  }

  if (catalog.isLoading || snapshot === null) {
    return <ControlLoading label="networks" />;
  }

  return (
    <div className="page-stack catalog-page">
      <ControlModuleHeader
        description="Connect provider accounts, define custom tracking and postback defaults, and control operational status."
        eyebrow="Network Setup"
        icon="account_tree"
        stats={[
          { label: 'Total', value: snapshot.summary.networks },
          { label: 'Active', value: snapshot.networks.filter((network) => network.status === 'active').length },
          { label: 'Offers', value: snapshot.summary.offers },
        ]}
        title="Networks"
      />

      <ControlFeedback error={actionError ?? catalog.error} message={message} />

      {catalog.permissions.canManageCatalog && (
        <GlassPanel as="section" className="control-card catalog-editor-panel">
          <ControlCardHeading
            eyebrow={editingId === null ? 'Add Network' : 'Edit Network'}
            title={editingId === null ? 'Connect a network' : `Update ${form.name}`}
            description="Provider, custom tracking parameter, postback URL, and duplicate policy are stored together."
          />
          {providers.length === 0 ? (
            <ControlEmpty icon="hub" title="No active providers" message="A Platform Super Admin must configure an active network provider first." />
          ) : (
            <NetworkForm
              disabled={catalog.isMutating}
              form={form}
              mode={editingId === null ? 'create' : 'edit'}
              onCancel={editingId === null ? undefined : () => { setEditingId(null); setForm(emptyForm()); }}
              onChange={setForm}
              onSubmit={(event) => void handleSubmit(event)}
              providers={providers}
            />
          )}
        </GlassPanel>
      )}

      <GlassPanel as="section" className="control-card catalog-table-panel">
        <ControlCardHeading
          action={<RefreshButton disabled={catalog.isRefreshing} onClick={() => void catalog.refresh()} />}
          eyebrow="Network Directory"
          title="Connected networks"
          description="Search, filter, edit, duplicate, and review offer usage."
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
              setProviderId(event.currentTarget.value);
              setPage(1);
            }}
            value={providerId}
          >
            <option value="">All providers</option>
            {snapshot.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
          </select>
          <select
            onChange={(event) => {
              setStatus(event.currentTarget.value as CatalogNetworkStatus | 'all');
              setPage(1);
            }}
            value={status}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="archived">Archived</option>
          </select>
          <input
            aria-label="Networks added after"
            onChange={(event) => {
              setCreatedAfter(event.currentTarget.value);
              setPage(1);
            }}
            type="date"
            value={createdAfter}
          />
        </CatalogToolbar>

        {pageRows.length === 0 ? (
          <ControlEmpty icon="account_tree" title="No networks found" message="Add a network or change the filters." />
        ) : (
          <div className="responsive-table catalog-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Network</th>
                  <th>Provider</th>
                  <th>Offers</th>
                  <th>Tracking parameter</th>
                  <th>Duplicates</th>
                  <th>Status</th>
                  <th>Added</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((network) => (
                  <tr key={network.id}>
                    <td><strong>{network.name}</strong><small>{network.externalAccountId ?? 'No external ID'}</small></td>
                    <td>{network.providerName}<small>{network.providerCode}</small></td>
                    <td>{network.offerCount}</td>
                    <td><code>{network.trackingParameter ?? 'Not configured'}</code></td>
                    <td>{network.duplicateAllowed ? 'Allowed' : 'Blocked'}</td>
                    <td><ControlStatus status={network.status} /></td>
                    <td>{formatDateTime(network.createdAt)}</td>
                    <td>
                      <RowActions>
                        {catalog.permissions.canManageCatalog && network.status !== 'archived' && (
                          <button aria-label={`Edit ${network.name}`} onClick={() => editNetwork(network)} title="Edit" type="button"><MaterialIcon name="edit" /></button>
                        )}
                        {catalog.permissions.canManageCatalog && (
                          <button aria-label={`Duplicate ${network.name}`} onClick={() => duplicateNetwork(network)} title="Duplicate" type="button"><MaterialIcon name="content_copy" /></button>
                        )}
                        {network.postbackUrl !== null && (
                          <a aria-label={`Open ${network.name} postback`} href={network.postbackUrl} rel="noreferrer" target="_blank" title="View postback"><MaterialIcon name="visibility" /></a>
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
    </div>
  );
}
