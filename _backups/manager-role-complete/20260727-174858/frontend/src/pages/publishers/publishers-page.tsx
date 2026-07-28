import { type FormEvent, useMemo, useState } from 'react';

import { MaterialIcon } from '../../components/icons/material-icon';
import { GlassPanel } from '../../components/ui/glass-panel';
import { TIMEZONE_OPTIONS } from '../../features/catalog/catalog-options';
import type { CatalogPayoutType, CatalogPublisher } from '../../features/catalog/catalog.types';
import { useCatalogOperations } from '../../features/catalog/use-catalog';
import { useTenantAdministration } from '../../features/tenant-administration/use-tenant-administration';
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

type PublisherFormState = {
  timezone: string;
  payoutType: CatalogPayoutType;
  postbackUrl: string;
  emailNotificationsEnabled: boolean;
};

function formFromPublisher(publisher: CatalogPublisher): PublisherFormState {
  return {
    timezone: publisher.timezone,
    payoutType: publisher.payoutType,
    postbackUrl: publisher.postbackUrl ?? '',
    emailNotificationsEnabled: publisher.emailNotificationsEnabled,
  };
}

export function PublishersPage() {
  const catalog = useCatalogOperations();
  const tenant = useTenantAdministration({
    search: '',
    role: 'publisher',
    membershipStatus: '',
    userStatus: '',
  });
  const [inviteEmail, setInviteEmail] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PublisherFormState>({
    timezone: 'UTC',
    payoutType: 'per_offer',
    postbackUrl: '',
    emailNotificationsEnabled: true,
  });
  const [search, setSearch] = useState('');
  const [membershipStatus, setMembershipStatus] = useState('all');
  const [createdAfter, setCreatedAfter] = useState('');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const snapshot = catalog.snapshot;

  const pendingInvitations = useMemo(
    () => tenant.invitations.filter((invitation) => invitation.role === 'publisher' && invitation.status === 'pending'),
    [tenant.invitations],
  );

  const filteredPublishers = useMemo(() => {
    const items = snapshot?.publishers ?? [];
    const needle = search.trim().toLowerCase();
    return items.filter((publisher) => {
      const label = `${publisher.displayName ?? ''} ${publisher.email ?? ''}`.toLowerCase();
      const matchesCreatedAfter =
        createdAfter.length === 0 ||
        new Date(publisher.createdAt).getTime() >= new Date(`${createdAfter}T00:00:00`).getTime();

      return (
        (needle.length === 0 || label.includes(needle)) &&
        (membershipStatus === 'all' || publisher.membershipStatus === membershipStatus) &&
        matchesCreatedAfter
      );
    });
  }, [createdAfter, membershipStatus, search, snapshot]);

  const pageCount = Math.max(1, Math.ceil(filteredPublishers.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRows = filteredPublishers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function resetFeedback() {
    setMessage(null);
    setActionError(null);
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();

    try {
      await tenant.createInvitation({ email: inviteEmail, role: 'publisher' });
      setMessage(`Publisher invitation was queued for ${inviteEmail.trim()}.`);
      setInviteEmail('');
      await catalog.refresh();
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'The Publisher invitation could not be created.');
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (editingId === null) {
      return;
    }

    resetFeedback();

    try {
      await catalog.updatePublisher({
        membershipId: editingId,
        timezone: form.timezone,
        payoutType: form.payoutType,
        postbackUrl: form.postbackUrl.trim() || null,
        emailNotificationsEnabled: form.emailNotificationsEnabled,
      });
      setMessage('Publisher configuration was updated.');
      setEditingId(null);
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'The Publisher could not be updated.');
    }
  }

  function editPublisher(publisher: CatalogPublisher) {
    resetFeedback();
    setEditingId(publisher.membershipId);
    setForm(formFromPublisher(publisher));
    document.querySelector('.publisher-editor-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (!catalog.permissions.canReadCatalog) {
    return <ControlAccessDenied title="Publisher access unavailable" message="Manager or Company Administrator access is required." />;
  }

  if (catalog.isLoading || snapshot === null || tenant.status === 'loading') {
    return <ControlLoading label="Publishers" />;
  }

  return (
    <div className="page-stack catalog-page">
      <ControlModuleHeader
        description="Invite Publishers through the secure Brevo workflow, then manage their timezone, payout mode, postback, notifications, and offer coverage."
        eyebrow="Publisher Setup"
        icon="group"
        stats={[
          { label: 'Active', value: snapshot.publishers.filter((publisher) => publisher.membershipStatus === 'active').length },
          { label: 'Pending', value: pendingInvitations.length },
          { label: 'Offer links', value: snapshot.publishers.reduce((total, publisher) => total + publisher.offerCount, 0) },
        ]}
        title="Publishers"
      />

      <ControlFeedback error={actionError ?? catalog.error ?? tenant.error} message={message} />

      {catalog.permissions.canManagePublishers && (
        <div className="catalog-two-column">
          <GlassPanel as="section" className="control-card publisher-editor-panel">
            <ControlCardHeading
              eyebrow="Add Publisher"
              title="Send a secure invitation"
              description="No password is collected or stored here. The Publisher sets a password through the one-time invitation link."
            />
            <form className="catalog-form" onSubmit={(event) => void handleInvite(event)}>
              <label>
                <span>Email</span>
                <input
                  autoComplete="email"
                  disabled={tenant.isMutating}
                  onChange={(event) => setInviteEmail(event.currentTarget.value)}
                  placeholder="publisher@example.com"
                  required
                  type="email"
                  value={inviteEmail}
                />
              </label>
              <div className="catalog-security-note">
                <MaterialIcon name="verified_user" />
                <span>Invitation is committed first, encrypted in the outbox, and delivered asynchronously by Brevo.</span>
              </div>
              <button className="primary-gradient-button primary-gradient-button--compact" disabled={tenant.isMutating} type="submit">
                <MaterialIcon name="send" />
                Invite Publisher
              </button>
            </form>
          </GlassPanel>

          <GlassPanel as="section" className="control-card">
            <ControlCardHeading
              eyebrow="Pending Invitations"
              title="Awaiting acceptance"
              description="Resend or revoke invitations without creating duplicate users."
            />
            {pendingInvitations.length === 0 ? (
              <ControlEmpty icon="mail" title="No pending invitations" message="New Publisher invitations will appear here." />
            ) : (
              <div className="catalog-compact-list">
                {pendingInvitations.map((invitation) => (
                  <article key={invitation.id}>
                    <div>
                      <strong>{invitation.email}</strong>
                      <span>Delivery: {invitation.deliveryStatus} · Expires {formatDateTime(invitation.expiresAt)}</span>
                    </div>
                    <RowActions>
                      <button
                        aria-label={`Resend invitation to ${invitation.email}`}
                        disabled={tenant.isMutating}
                        onClick={() => void tenant.resendInvitation({ invitationId: invitation.id })}
                        title="Resend"
                        type="button"
                      >
                        <MaterialIcon name="refresh" />
                      </button>
                      <button
                        aria-label={`Revoke invitation to ${invitation.email}`}
                        disabled={tenant.isMutating}
                        onClick={() => void tenant.revokeInvitation({ invitationId: invitation.id })}
                        title="Revoke"
                        type="button"
                      >
                        <MaterialIcon name="delete" />
                      </button>
                    </RowActions>
                  </article>
                ))}
              </div>
            )}
          </GlassPanel>
        </div>
      )}

      {editingId !== null && (
        <GlassPanel as="section" className="control-card publisher-editor-panel">
          <ControlCardHeading eyebrow="Publisher Configuration" title="Update operational settings" />
          <form className="catalog-form" onSubmit={(event) => void handleSave(event)}>
            <div className="catalog-form-grid catalog-form-grid--three">
              <label>
                <span>Timezone</span>
                <select disabled={catalog.isMutating} onChange={(event) => setForm({ ...form, timezone: event.currentTarget.value })} value={form.timezone}>
                  {TIMEZONE_OPTIONS.map((timezone) => <option key={timezone}>{timezone}</option>)}
                </select>
              </label>
              <label>
                <span>Payout type</span>
                <select disabled={catalog.isMutating} onChange={(event) => setForm({ ...form, payoutType: event.currentTarget.value as CatalogPayoutType })} value={form.payoutType}>
                  <option value="per_offer">Per offer</option>
                  <option value="fixed_member">Fixed member payout</option>
                </select>
              </label>
              <label className="catalog-field--wide">
                <span>Postback URL</span>
                <input disabled={catalog.isMutating} onChange={(event) => setForm({ ...form, postbackUrl: event.currentTarget.value })} type="url" value={form.postbackUrl} />
              </label>
            </div>
            <ToggleField
              checked={form.emailNotificationsEnabled}
              disabled={catalog.isMutating}
              label="Email notifications"
              onChange={(emailNotificationsEnabled) => setForm({ ...form, emailNotificationsEnabled })}
            />
            <div className="catalog-form-actions">
              <button className="control-secondary-button" disabled={catalog.isMutating} onClick={() => setEditingId(null)} type="button">Cancel</button>
              <button className="primary-gradient-button primary-gradient-button--compact" disabled={catalog.isMutating} type="submit"><MaterialIcon name="save" />Save Publisher</button>
            </div>
          </form>
        </GlassPanel>
      )}

      <GlassPanel as="section" className="control-card catalog-table-panel">
        <ControlCardHeading
          action={<RefreshButton disabled={catalog.isRefreshing || tenant.isMutating} onClick={() => void Promise.all([catalog.refresh(), tenant.refresh()])} />}
          eyebrow="Publisher Directory"
          title="Accepted Publishers"
          description="Offer assignment is managed from the Offers screen after acceptance."
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
              setMembershipStatus(event.currentTarget.value);
              setPage(1);
            }}
            value={membershipStatus}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="revoked">Revoked</option>
          </select>
          <input
            aria-label="Publishers added after"
            onChange={(event) => {
              setCreatedAfter(event.currentTarget.value);
              setPage(1);
            }}
            type="date"
            value={createdAfter}
          />
        </CatalogToolbar>

        {pageRows.length === 0 ? (
          <ControlEmpty icon="group" title="No Publishers found" message="Invite a Publisher or change the filters." />
        ) : (
          <div className="responsive-table catalog-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Publisher</th>
                  <th>Email</th>
                  <th>Offers</th>
                  <th>Timezone</th>
                  <th>Payout</th>
                  <th>Notifications</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {pageRows.map((publisher) => (
                  <tr key={publisher.membershipId}>
                    <td><strong>{publisher.displayName ?? 'Publisher'}</strong><small>{publisher.membershipId.slice(0, 8)}</small></td>
                    <td>{publisher.email ?? 'Unavailable'}</td>
                    <td>{publisher.offerCount}</td>
                    <td>{publisher.timezone}</td>
                    <td>{publisher.payoutType === 'per_offer' ? 'Per offer' : 'Fixed member'}</td>
                    <td>{publisher.emailNotificationsEnabled ? 'Enabled' : 'Disabled'}</td>
                    <td><ControlStatus status={publisher.membershipStatus} /></td>
                    <td>{publisher.joinedAt === null ? 'Not joined' : formatDateTime(publisher.joinedAt)}</td>
                    <td>
                      <RowActions>
                        {catalog.permissions.canManagePublishers && publisher.membershipStatus !== 'revoked' && (
                          <button aria-label={`Edit ${publisher.email ?? 'Publisher'}`} onClick={() => editPublisher(publisher)} title="Edit" type="button"><MaterialIcon name="edit" /></button>
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
