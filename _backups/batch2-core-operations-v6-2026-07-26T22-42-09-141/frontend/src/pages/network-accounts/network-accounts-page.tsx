import {
  formatTrackingDate,
  maskExternalAccountId,
} from '../tracking-networks/tracking-network-formatters';
import {
  ModuleAccessState,
  ModuleFeedback,
  ModuleLoadingState,
  StatusPill,
} from '../tracking-networks/tracking-network-ui';
import {
  type FormEvent,
  useMemo,
  useState } from 'react';

import { MaterialIcon } from '../../components/icons/material-icon';
import { GlassPanel } from '../../components/ui/glass-panel';
import { useCompany } from '../../features/companies/use-company';
import type {
  NetworkAccount,
  NetworkAccountStatus,
  } from '../../features/tracking-networks/tracking-networks.types';
import {
  useNetworkAccounts,
  useNetworkProviders,
  } from '../../features/tracking-networks/use-tracking-networks';
function AccountEditor({
  account,
  disabled,
  canManage,
  revealed,
  onToggleReveal,
  onUpdate,
}: {
  account: NetworkAccount;
  disabled: boolean;
  canManage: boolean;
  revealed: boolean;
  onToggleReveal: (accountId: string) => void;
  onUpdate: (
    account: NetworkAccount,
    input: {
      name: string;
      externalAccountId: string | null;
      status: NetworkAccountStatus;
    },
  ) => Promise<void>;
}) {
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const name = formData.get('name');
    const externalAccountId = formData.get('externalAccountId');
    const status = formData.get('status');

    if (
      typeof name !== 'string' ||
      typeof externalAccountId !== 'string' ||
      !['active', 'suspended', 'archived'].includes(String(status))
    ) {
      return;
    }

    await onUpdate(account, {
      name,
      externalAccountId:
        externalAccountId.trim().length === 0 ? null : externalAccountId.trim(),
      status: status as NetworkAccountStatus,
    });
  }

  const immutable = account.status === 'archived';

  return (
    <article className="tracking-record-card tracking-account-card">
      <div className="tracking-record-card__heading">
        <div className="tracking-record-icon">
          <MaterialIcon name="account_tree" />
        </div>
        <div>
          <div className="tracking-title-line">
            <strong>{account.name}</strong>
            <code className="tracking-code-badge">{account.providerCode}</code>
          </div>
          <span>
            {account.providerName} · Updated {formatTrackingDate(account.updatedAt)}
          </span>
        </div>
        <StatusPill status={account.status} />
      </div>

      <div className="tracking-record-meta tracking-record-meta--three">
        <div>
          <span>Provider</span>
          <strong>{account.providerName}</strong>
        </div>
        <div>
          <span>External account ID</span>
          <button
            className="tracking-copy-value"
            disabled={account.externalAccountId === null}
            onClick={() => onToggleReveal(account.id)}
            type="button"
          >
            <code>
              {revealed
                ? account.externalAccountId ?? 'Not configured'
                : maskExternalAccountId(account.externalAccountId)}
            </code>
            <MaterialIcon name={revealed ? 'lock' : 'lock_open'} />
          </button>
        </div>
        <div>
          <span>Company scope</span>
          <strong>Selected tenant only</strong>
        </div>
      </div>

      {canManage && !immutable && (
        <form
          className="tracking-provider-form tracking-account-form"
          key={`${account.id}:${account.updatedAt}`}
          onSubmit={(event) => void handleSubmit(event)}
        >
          <label>
            <span>Account name</span>
            <input defaultValue={account.name} disabled={disabled} name="name" />
          </label>
          <label>
            <span>External account ID</span>
            <input
              autoComplete="off"
              defaultValue={account.externalAccountId ?? ''}
              disabled={disabled}
              name="externalAccountId"
              placeholder="Optional provider account ID"
              spellCheck={false}
            />
          </label>
          <label>
            <span>Status</span>
            <select defaultValue={account.status} disabled={disabled} name="status">
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <button className="tracking-secondary-button" disabled={disabled} type="submit">
            <MaterialIcon name="save" />
            Save account
          </button>
        </form>
      )}

      {immutable && (
        <div className="tracking-info-note tracking-info-note--compact">
          <MaterialIcon name="lock" />
          <span>Archived accounts are immutable and remain available for history.</span>
        </div>
      )}
    </article>
  );
}

export function NetworkAccountsPage() {
  const company = useCompany();
  const accounts = useNetworkAccounts();
  const providers = useNetworkProviders();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<NetworkAccountStatus | 'all'>('all');
  const [providerId, setProviderId] = useState('');
  const [name, setName] = useState('');
  const [externalAccountId, setExternalAccountId] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [revealedIds, setRevealedIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  const activeProviders = useMemo(
    () => providers.providers.filter((provider) => provider.status === 'active'),
    [providers.providers],
  );

  const filteredAccounts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return accounts.accounts.filter((account) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        account.name.toLowerCase().includes(normalizedSearch) ||
        account.providerName.toLowerCase().includes(normalizedSearch) ||
        account.providerCode.includes(normalizedSearch) ||
        account.externalAccountId?.toLowerCase().includes(normalizedSearch) === true;
      const matchesStatus = status === 'all' || account.status === status;

      return matchesSearch && matchesStatus;
    });
  }, [accounts.accounts, search, status]);

  const activeCount = useMemo(
    () => accounts.accounts.filter((account) => account.status === 'active').length,
    [accounts.accounts],
  );
  const suspendedCount = useMemo(
    () => accounts.accounts.filter((account) => account.status === 'suspended').length,
    [accounts.accounts],
  );

  function resetFeedback() {
    setFeedback(null);
    setActionError(null);
  }

  function handleToggleReveal(accountId: string) {
    setRevealedIds((current) => {
      const next = new Set(current);

      if (next.has(accountId)) {
        next.delete(accountId);
      } else {
        next.add(accountId);
      }

      return next;
    });
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();
    const normalizedName = name.trim();

    if (providerId.length === 0) {
      setActionError('Select a network provider.');
      return;
    }

    if (normalizedName.length < 2) {
      setActionError('Account name must contain at least two characters.');
      return;
    }

    try {
      await accounts.createAccount({
        providerId,
        name: normalizedName,
        externalAccountId:
          externalAccountId.trim().length === 0
            ? null
            : externalAccountId.trim(),
      });
      setProviderId('');
      setName('');
      setExternalAccountId('');
      setFeedback(`${normalizedName} was connected to this company.`);
    } catch (error: unknown) {
      setActionError(
        error instanceof Error ? error.message : 'The network account could not be created.',
      );
    }
  }

  async function handleUpdate(
    account: NetworkAccount,
    input: {
      name: string;
      externalAccountId: string | null;
      status: NetworkAccountStatus;
    },
  ) {
    resetFeedback();
    const normalizedName = input.name.trim();

    if (normalizedName.length < 2) {
      setActionError('Account name must contain at least two characters.');
      return;
    }

    const changed =
      normalizedName !== account.name ||
      input.externalAccountId !== account.externalAccountId ||
      input.status !== account.status;

    if (!changed) {
      setActionError('The network account configuration has not changed.');
      return;
    }

    try {
      await accounts.updateAccount({
        accountId: account.id,
        name: normalizedName,
        externalAccountId: input.externalAccountId,
        status: input.status,
      });
      setFeedback(`${normalizedName} was updated successfully.`);
    } catch (error: unknown) {
      setActionError(
        error instanceof Error ? error.message : 'The network account could not be updated.',
      );
    }
  }

  if (company.activeCompany === null) {
    return (
      <ModuleAccessState icon="domain_disabled" title="Select an active company">
        Network-account management requires an active company context.
      </ModuleAccessState>
    );
  }

  if (accounts.status === 'forbidden') {
    return (
      <ModuleAccessState icon="lock" title="Network accounts are restricted">
        Company Admin, Manager, or Platform Super Admin access is required.
      </ModuleAccessState>
    );
  }

  if (accounts.status === 'loading' || providers.status === 'loading') {
    return <ModuleLoadingState label="network accounts" />;
  }

  return (
    <div className="tracking-module-page page-stack">
      <GlassPanel as="section" className="page-heading-panel tracking-heading-panel">
        <div>
          <span className="eyebrow-chip">
            <MaterialIcon name="account_tree" filled />
            Tenant Connections
          </span>
          <h1>Network Accounts</h1>
          <p>
            Manage affiliate-network identities connected to{' '}
            <strong>{company.activeCompany.name}</strong>.
          </p>
        </div>
        <div className="tracking-heading-stats">
          <div>
            <span>Total</span>
            <strong>{accounts.accounts.length}</strong>
          </div>
          <div>
            <span>Active</span>
            <strong>{activeCount}</strong>
          </div>
          <div>
            <span>Suspended</span>
            <strong>{suspendedCount}</strong>
          </div>
        </div>
      </GlassPanel>

      <ModuleFeedback
        error={actionError ?? accounts.error ?? providers.error}
        message={feedback}
      />

      <div className="tracking-module-grid">
        {accounts.permissions.canManage && (
          <GlassPanel as="section" className="tracking-create-card">
            <div className="tracking-section-heading">
              <div>
                <span className="eyebrow-chip">Company Connection</span>
                <h2>Add network account</h2>
                <p>Connect an active provider to the selected company.</p>
              </div>
              <MaterialIcon name="add_link" />
            </div>

            <form className="tracking-form" onSubmit={(event) => void handleCreate(event)}>
              <label>
                <span>Network provider</span>
                <select
                  disabled={accounts.isMutating || activeProviders.length === 0}
                  onChange={(event) => setProviderId(event.target.value)}
                  value={providerId}
                >
                  <option value="">Select provider</option>
                  {activeProviders.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name} ({provider.code})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Account name</span>
                <input
                  disabled={accounts.isMutating}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Primary publisher account"
                  value={name}
                />
              </label>
              <label>
                <span>External account ID</span>
                <input
                  autoComplete="off"
                  disabled={accounts.isMutating}
                  onChange={(event) => setExternalAccountId(event.target.value)}
                  placeholder="Optional provider account ID"
                  spellCheck={false}
                  value={externalAccountId}
                />
              </label>
              <button
                className="tracking-primary-button tracking-primary-button--wide"
                disabled={accounts.isMutating || activeProviders.length === 0}
                type="submit"
              >
                <MaterialIcon name="add_circle" />
                Add account
              </button>
            </form>

            <div className="tracking-info-note">
              <MaterialIcon name="encrypted" />
              <span>
                Identifiers are masked in the directory. Provider credentials are never
                rendered by this interface.
              </span>
            </div>
          </GlassPanel>
        )}

        <GlassPanel
          as="section"
          className={
            accounts.permissions.canManage
              ? 'tracking-list-card'
              : 'tracking-list-card tracking-list-card--full'
          }
        >
          <div className="tracking-section-heading tracking-section-heading--toolbar">
            <div>
              <span className="eyebrow-chip">Account Directory</span>
              <h2>Connected accounts</h2>
              <p>{filteredAccounts.length} matching network accounts.</p>
            </div>
            <button
              aria-label="Refresh network accounts"
              className="icon-button"
              disabled={accounts.isMutating}
              onClick={() => void accounts.refresh()}
              type="button"
            >
              <MaterialIcon name="refresh" />
            </button>
          </div>

          <div className="tracking-filter-bar">
            <div className="tracking-input-with-icon">
              <MaterialIcon name="search" />
              <input
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search account or provider"
                value={search}
              />
            </div>
            <select
              aria-label="Filter network accounts by status"
              onChange={(event) =>
                setStatus(event.target.value as NetworkAccountStatus | 'all')
              }
              value={status}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {accounts.status === 'error' && filteredAccounts.length === 0 ? (
            <div className="tracking-empty-state tracking-empty-state--error">
              <MaterialIcon name="cloud_off" />
              <strong>Network accounts could not be loaded</strong>
              <span>{accounts.error}</span>
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div className="tracking-empty-state">
              <MaterialIcon name="account_tree" />
              <strong>No matching network accounts</strong>
              <span>Add an account or change the current filters.</span>
            </div>
          ) : (
            <div className="tracking-record-list">
              {filteredAccounts.map((account) => (
                <AccountEditor
                  account={account}
                  canManage={accounts.permissions.canManage}
                  disabled={accounts.isMutating}
                  key={account.id}
                  onToggleReveal={handleToggleReveal}
                  onUpdate={handleUpdate}
                  revealed={revealedIds.has(account.id)}
                />
              ))}
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
