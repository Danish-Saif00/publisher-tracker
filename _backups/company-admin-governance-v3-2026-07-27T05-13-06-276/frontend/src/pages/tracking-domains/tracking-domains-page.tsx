import { type FormEvent, useMemo, useState } from 'react';

import { MaterialIcon } from '../../components/icons/material-icon';
import { GlassPanel } from '../../components/ui/glass-panel';
import { useCatalogOperations } from '../../features/catalog/use-catalog';
import type { TrackingDomainStatus } from '../../features/tracking-networks/tracking-networks.types';
import { useTrackingDomains } from '../../features/tracking-networks/use-tracking-networks';
import {
  CatalogPagination,
  CatalogToolbar,
  RowActions,
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

export function TrackingDomainsPage() {
  const domains = useTrackingDomains();
  const catalog = useCatalogOperations();
  const [hostname, setHostname] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<TrackingDomainStatus | 'all'>('all');
  const [createdAfter, setCreatedAfter] = useState('');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const offerCountByDomain = useMemo(
    () => new Map(catalog.snapshot?.domains.map((domain) => [domain.id, domain.offerCount]) ?? []),
    [catalog.snapshot],
  );

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const threshold = createdAfter.length === 0 ? null : new Date(`${createdAfter}T00:00:00`);
    return domains.domains.filter((domain) => {
      const matchesDate = threshold === null || new Date(domain.createdAt) >= threshold;
      return (
        (needle.length === 0 || domain.hostname.toLowerCase().includes(needle)) &&
        (status === 'all' || domain.status === status) &&
        matchesDate
      );
    });
  }, [createdAfter, domains.domains, search, status]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function resetFeedback() {
    setMessage(null);
    setActionError(null);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();

    try {
      const created = await domains.createDomain({ hostname });
      setHostname('');
      setMessage(`${created.hostname} was added. Publish its TXT verification token before activation.`);
      await catalog.refresh();
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'The domain could not be added.');
    }
  }

  async function handlePrimary(domainId: string) {
    resetFeedback();
    try {
      await domains.updateDomain({ domainId, isPrimary: true });
      setMessage('Primary tracking domain was updated.');
      await catalog.refresh();
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'The primary domain could not be updated.');
    }
  }

  async function handleStatus(domainId: string, nextStatus: 'active' | 'suspended' | 'archived') {
    resetFeedback();
    try {
      if (domains.permissions.platformAdmin) {
        await domains.updatePlatformStatus({ domainId, status: nextStatus });
      } else if (nextStatus !== 'active') {
        await domains.updateDomain({ domainId, status: nextStatus });
      }
      setMessage(`Domain status changed to ${nextStatus.replaceAll('_', ' ')}.`);
      await catalog.refresh();
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'The domain status could not be updated.');
    }
  }

  async function copyToken(token: string) {
    await navigator.clipboard.writeText(token);
    setMessage('DNS verification token copied.');
  }

  if (domains.status === 'forbidden') {
    return <ControlAccessDenied title="Domain access unavailable" message="Manager or Company Administrator access is required." />;
  }

  if (domains.status === 'loading' || catalog.isLoading) {
    return <ControlLoading label="tracking domains" />;
  }

  return (
    <div className="page-stack catalog-page">
      <ControlModuleHeader
        description="Add branded tracking hosts, publish DNS verification records, and control domain readiness for offers and links."
        eyebrow="Domain Setup"
        icon="dns"
        stats={[
          { label: 'Total', value: domains.domains.length },
          { label: 'Active', value: domains.domains.filter((domain) => domain.status === 'active').length },
          { label: 'Primary', value: domains.domains.find((domain) => domain.isPrimary)?.hostname ?? 'Not set' },
        ]}
        title="Domains"
      />

      <ControlFeedback error={actionError ?? domains.error ?? catalog.error} message={message} />

      {domains.permissions.canManage && (
        <div className="catalog-two-column">
          <GlassPanel as="section" className="control-card">
            <ControlCardHeading
              eyebrow="Add Domain"
              title="Register a tracking hostname"
              description="Use a dedicated subdomain such as go.example.com."
            />
            <form className="catalog-form" onSubmit={(event) => void handleCreate(event)}>
              <label>
                <span>Domain name</span>
                <input
                  autoCapitalize="none"
                  disabled={domains.isMutating}
                  onChange={(event) => setHostname(event.currentTarget.value)}
                  placeholder="go.example.com"
                  required
                  spellCheck={false}
                  value={hostname}
                />
              </label>
              <button className="primary-gradient-button primary-gradient-button--compact" disabled={domains.isMutating} type="submit">
                <MaterialIcon name="add" />
                Add domain
              </button>
            </form>
          </GlassPanel>

          <GlassPanel as="section" className="control-card dns-instructions-card">
            <ControlCardHeading eyebrow="DNS Instructions" title="Verify ownership" />
            <ol>
              <li>Open the DNS manager for the parent domain.</li>
              <li>Create a TXT record for the exact hostname.</li>
              <li>Copy the verification token shown in the directory below.</li>
              <li>After DNS propagation, a Platform Super Admin can activate the domain.</li>
            </ol>
            <div className="catalog-security-note">
              <MaterialIcon name="info" />
              <span>No screenshot IP or sample DNS value is hardcoded. Every domain receives its own verification token.</span>
            </div>
          </GlassPanel>
        </div>
      )}

      <GlassPanel as="section" className="control-card catalog-table-panel">
        <ControlCardHeading
          action={<RefreshButton disabled={domains.isMutating} onClick={() => void Promise.all([domains.refresh(), catalog.refresh()])} />}
          eyebrow="Domain Directory"
          title="Manage domains"
          description="Filter by hostname, status, and creation date."
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
              setStatus(event.currentTarget.value as TrackingDomainStatus | 'all');
              setPage(1);
            }}
            value={status}
          >
            <option value="all">All statuses</option>
            <option value="pending_verification">Pending verification</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="archived">Archived</option>
          </select>
          <input
            aria-label="Created after"
            onChange={(event) => {
              setCreatedAfter(event.currentTarget.value);
              setPage(1);
            }}
            type="date"
            value={createdAfter}
          />
        </CatalogToolbar>

        {pageRows.length === 0 ? (
          <ControlEmpty icon="dns" title="No domains found" message="Add a domain or change the filters." />
        ) : (
          <div className="responsive-table catalog-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Offers</th>
                  <th>Verification token</th>
                  <th>Primary</th>
                  <th>Status</th>
                  <th>Added</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((domain) => (
                  <tr key={domain.id}>
                    <td><strong>{domain.hostname}</strong><small>{domain.verifiedAt === null ? 'Not verified' : `Verified ${formatDateTime(domain.verifiedAt)}`}</small></td>
                    <td>{offerCountByDomain.get(domain.id) ?? 0}</td>
                    <td>
                      <button className="catalog-copy-token" onClick={() => void copyToken(domain.verificationToken)} title="Copy token" type="button">
                        <code>{domain.verificationToken.slice(0, 16)}…</code>
                        <MaterialIcon name="content_copy" />
                      </button>
                    </td>
                    <td>{domain.isPrimary ? 'Yes' : 'No'}</td>
                    <td><ControlStatus status={domain.status} /></td>
                    <td>{formatDateTime(domain.createdAt)}</td>
                    <td>
                      <RowActions>
                        {domains.permissions.canManage && domain.status === 'active' && !domain.isPrimary && (
                          <button aria-label={`Make ${domain.hostname} primary`} onClick={() => void handlePrimary(domain.id)} title="Make primary" type="button"><MaterialIcon name="star" /></button>
                        )}
                        {domains.permissions.platformAdmin && domain.status === 'pending_verification' && (
                          <button aria-label={`Activate ${domain.hostname}`} onClick={() => void handleStatus(domain.id, 'active')} title="Activate" type="button"><MaterialIcon name="verified" /></button>
                        )}
                        {domains.permissions.canManage && domain.status === 'active' && (
                          <button aria-label={`Suspend ${domain.hostname}`} onClick={() => void handleStatus(domain.id, 'suspended')} title="Suspend" type="button"><MaterialIcon name="pause" /></button>
                        )}
                        {domains.permissions.canManage && domain.status !== 'archived' && !domain.isPrimary && (
                          <button aria-label={`Archive ${domain.hostname}`} onClick={() => void handleStatus(domain.id, 'archived')} title="Archive" type="button"><MaterialIcon name="delete" /></button>
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
