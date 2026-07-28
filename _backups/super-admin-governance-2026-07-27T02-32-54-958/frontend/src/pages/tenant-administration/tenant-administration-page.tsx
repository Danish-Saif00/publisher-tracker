import { type FormEvent, useMemo, useState } from 'react';

import { MaterialIcon } from '../../components/icons/material-icon';
import { GlassPanel } from '../../components/ui/glass-panel';
import type {
  CompanyMembershipStatus,
  CompanyRole,
} from '../../features/auth/auth.types';
import { useAuth } from '../../features/auth/use-auth';
import { useCompany } from '../../features/companies/use-company';
import type {
  CompanyDirectoryUser,
  CompanyInvitation,
  DirectoryFilters,
  UserStatus,
} from '../../features/tenant-administration/tenant-administration.types';
import { useTenantAdministration } from '../../features/tenant-administration/use-tenant-administration';

type TenantTab = 'directory' | 'audit';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

const roleOptions: readonly CompanyRole[] = [
  'company_admin',
  'manager',
  'publisher',
];

// frontend_invitation_role_matrix_v1
const companyAdminInvitationRoleOptions:
  readonly CompanyRole[] = [
    'manager',
    'publisher',
  ];

const managerInvitationRoleOptions:
  readonly CompanyRole[] = [
    'publisher',
  ];

const noInvitationRoleOptions:
  readonly CompanyRole[] =
  Object.freeze([]);

function resolveInvitationRoleOptions(
  platformRole: string | null,
  companyRole: CompanyRole | null,
): readonly CompanyRole[] {
  if (
    platformRole ===
    'platform_super_admin'
  ) {
    return roleOptions;
  }

  if (companyRole === 'company_admin') {
    return companyAdminInvitationRoleOptions;
  }

  if (companyRole === 'manager') {
    return managerInvitationRoleOptions;
  }

  return noInvitationRoleOptions;
}

function canManageInvitationRole(
  platformRole: string | null,
  companyRole: CompanyRole | null,
  invitationRole: CompanyRole,
): boolean {
  if (
    platformRole ===
    'platform_super_admin'
  ) {
    return true;
  }

  if (companyRole === 'company_admin') {
    return (
      invitationRole === 'manager' ||
      invitationRole === 'publisher'
    );
  }

  return (
    companyRole === 'manager' &&
    invitationRole === 'publisher'
  );
}

const membershipStatusOptions: readonly CompanyMembershipStatus[] = [
  'invited',
  'active',
  'suspended',
  'revoked',
];

function formatLabel(value: string): string {
  return value
    .split(/[._-]/u)
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function formatDate(value: string | null): string {
  if (value === null) {
    return 'Not joined';
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? 'Unknown'
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date);
}

function compactId(value: string): string {
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function statusClass(value: string): string {
  return `tenant-status tenant-status--${value.replaceAll('_', '-')}`;
}

function formatMetadata(metadata: Readonly<Record<string, unknown>>): string {
  const entries = Object.entries(metadata);

  if (entries.length === 0) {
    return 'No additional metadata';
  }

  const text = entries
    .slice(0, 3)
    .map(([key, value]) => {
      const normalizedValue =
        typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
          ? String(value)
          : JSON.stringify(value);

      return `${formatLabel(key)}: ${normalizedValue}`;
    })
    .join(' · ');

  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
}

function UserAccessForm({
  user,
  disabled,
  canManageUserStatus,
  onSaveMembership,
  onToggleUserStatus,
}: {
  user: CompanyDirectoryUser;
  disabled: boolean;
  canManageUserStatus: boolean;
  onSaveMembership: (
    user: CompanyDirectoryUser,
    role: CompanyRole,
    status: CompanyMembershipStatus,
  ) => Promise<void>;
  onToggleUserStatus: (user: CompanyDirectoryUser) => Promise<void>;
}) {
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const roleValue = formData.get('role');
    const statusValue = formData.get('membershipStatus');

    if (
      typeof roleValue !== 'string' ||
      !roleOptions.includes(roleValue as CompanyRole) ||
      typeof statusValue !== 'string' ||
      !membershipStatusOptions.includes(statusValue as CompanyMembershipStatus)
    ) {
      return;
    }

    await onSaveMembership(
      user,
      roleValue as CompanyRole,
      statusValue as CompanyMembershipStatus,
    );
  }

  return (
    <form
      className="tenant-user-card__controls"
      key={`${user.membershipId}:${user.role}:${user.membershipStatus}`}
      onSubmit={(event) => void handleSubmit(event)}
    >
      <label>
        <span>Role</span>
        <select defaultValue={user.role} disabled={disabled} name="role">
          {roleOptions.map((role) => (
            <option key={role} value={role}>
              {formatLabel(role)}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>Membership</span>
        <select
          defaultValue={user.membershipStatus}
          disabled={disabled}
          name="membershipStatus"
        >
          {membershipStatusOptions.map((status) => (
            <option key={status} value={status}>
              {formatLabel(status)}
            </option>
          ))}
        </select>
      </label>

      <button className="tenant-secondary-button" disabled={disabled} type="submit">
        <MaterialIcon name="save" />
        Save access
      </button>

      {canManageUserStatus && (
        <button
          className={
            user.userStatus === 'active'
              ? 'tenant-danger-button'
              : 'tenant-secondary-button'
          }
          disabled={disabled}
          onClick={() => void onToggleUserStatus(user)}
          type="button"
        >
          <MaterialIcon
            name={user.userStatus === 'active' ? 'person_off' : 'person_check'}
          />
          {user.userStatus === 'active' ? 'Suspend account' : 'Activate account'}
        </button>
      )}
    </form>
  );
}

export function TenantAdministrationPage() {
  const auth = useAuth();
  const company = useCompany();
  const [tab, setTab] = useState<TenantTab>('directory');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<CompanyRole | ''>('');
  const [membershipStatus, setMembershipStatus] =
    useState<CompanyMembershipStatus | ''>('');
  const [userStatus, setUserStatus] = useState<UserStatus | ''>('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<CompanyRole>('publisher');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filters = useMemo<DirectoryFilters>(
    () => ({ search, role, membershipStatus, userStatus }),
    [membershipStatus, role, search, userStatus],
  );
  const tenant = useTenantAdministration(filters);
  const platformRole = auth.identity?.authorization.platformRole ?? null;
  const companyRole = auth.identity?.authorization.companyMembership?.role ?? null;
  const canManageMemberships =
    platformRole === 'platform_super_admin' ||
    companyRole === 'company_admin';

  const canCreateInvitations =
    canManageMemberships ||
    companyRole === 'manager';

  const canManageUserStatus =
    platformRole === 'platform_super_admin';

  const inviteRoleOptions =
    resolveInvitationRoleOptions(
      platformRole,
      companyRole,
    );
  const activeUsers = useMemo(
    () => tenant.directory.items.filter((user) => user.userStatus === 'active').length,
    [tenant.directory.items],
  );
  const pendingInvitations = useMemo(
    () => tenant.invitations.filter((invitation) => invitation.status === 'pending'),
    [tenant.invitations],
  );

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setActionError(null);
    const email = inviteEmail.trim().toLowerCase();

    if (!EMAIL_PATTERN.test(email)) {
      setActionError(
        'Enter a valid email address.',
      );
      return;
    }

    if (
      !inviteRoleOptions.includes(
        inviteRole,
      )
    ) {
      setActionError(
        'Your current role cannot create this invitation type.',
      );
      return;
    }

    try {
      await tenant.createInvitation({ email, role: inviteRole });
      setInviteEmail('');
      setFeedback(`Invitation created and queued for delivery to ${email}.`);
    } catch (error: unknown) {
      setActionError(
        error instanceof Error ? error.message : 'The invitation could not be created.',
      );
    }
  }

  async function handleResendInvitation(invitation: CompanyInvitation) {
    setFeedback(null);
    setActionError(null);

    try {
      await tenant.resendInvitation({ invitationId: invitation.id });
      setFeedback(`A fresh invitation was queued for delivery to ${invitation.email}.`);
    } catch (error: unknown) {
      setActionError(
        error instanceof Error ? error.message : 'The invitation could not be resent.',
      );
    }
  }

  async function handleRevokeInvitation(invitation: CompanyInvitation) {
    setFeedback(null);
    setActionError(null);

    try {
      await tenant.revokeInvitation({ invitationId: invitation.id });
      setFeedback(`The invitation for ${invitation.email} was revoked.`);
    } catch (error: unknown) {
      setActionError(
        error instanceof Error ? error.message : 'The invitation could not be revoked.',
      );
    }
  }

  async function handleMembershipUpdate(
    user: CompanyDirectoryUser,
    nextRole: CompanyRole,
    nextStatus: CompanyMembershipStatus,
  ) {
    setFeedback(null);
    setActionError(null);

    try {
      await tenant.updateMembership({
        membershipId: user.membershipId,
        role: nextRole,
        status: nextStatus,
      });
      setFeedback(`${user.displayName ?? compactId(user.userId)} access was updated.`);
    } catch (error: unknown) {
      setActionError(
        error instanceof Error ? error.message : 'The membership could not be updated.',
      );
    }
  }

  async function handleUserStatusUpdate(user: CompanyDirectoryUser) {
    setFeedback(null);
    setActionError(null);
    const nextStatus: UserStatus =
      user.userStatus === 'active' ? 'suspended' : 'active';

    try {
      await tenant.updateUserStatus({
        userId: user.userId,
        status: nextStatus,
      });
      setFeedback(
        `${user.displayName ?? compactId(user.userId)} account is now ${nextStatus}.`,
      );
    } catch (error: unknown) {
      setActionError(
        error instanceof Error ? error.message : 'The user status could not be updated.',
      );
    }
  }

  if (company.activeCompany === null) {
    return (
      <GlassPanel as="section" className="access-state-panel page-stack">
        <MaterialIcon name="domain_disabled" />
        <h1>Select an active company</h1>
        <p>Tenant administration requires a verified company context.</p>
      </GlassPanel>
    );
  }

  return (
    <div className="tenant-page page-stack">
      <GlassPanel as="section" className="page-heading-panel">
        <div>
          <span className="eyebrow-chip">
            <MaterialIcon name="admin_panel_settings" filled />
            Access Control
          </span>
          <h1>Tenant Administration</h1>
          <p>
            Manage membership roles, account access, and the audit trail for{' '}
            <strong>{company.activeCompany.name}</strong>.
          </p>
        </div>
        <div className="tenant-heading-stats">
          <div>
            <span>Loaded users</span>
            <strong>{tenant.directory.items.length}</strong>
          </div>
          <div>
            <span>Active</span>
            <strong>{activeUsers}</strong>
          </div>
          <div>
            <span>Pending invites</span>
            <strong>{pendingInvitations.length}</strong>
          </div>
        </div>
      </GlassPanel>

      <div className="tenant-tab-bar" role="tablist">
        <button
          aria-selected={tab === 'directory'}
          className={tab === 'directory' ? 'tenant-tab tenant-tab--active' : 'tenant-tab'}
          onClick={() => setTab('directory')}
          role="tab"
          type="button"
        >
          <MaterialIcon name="group" />
          User Directory
        </button>
        <button
          aria-selected={tab === 'audit'}
          className={tab === 'audit' ? 'tenant-tab tenant-tab--active' : 'tenant-tab'}
          onClick={() => setTab('audit')}
          role="tab"
          type="button"
        >
          <MaterialIcon name="history" />
          Audit Trail
        </button>
        <button
          aria-label="Refresh tenant administration data"
          className="tenant-refresh-button"
          disabled={tenant.status === 'loading'}
          onClick={() => void tenant.refresh()}
          type="button"
        >
          <MaterialIcon name="refresh" />
        </button>
      </div>

      {(actionError ?? tenant.error) !== null && (
        <div className="tenant-message tenant-message--error">
          <MaterialIcon name="error" />
          <span>{actionError ?? tenant.error}</span>
        </div>
      )}

      {feedback !== null && (
        <div className="tenant-message tenant-message--success">
          <MaterialIcon name="check_circle" />
          <span>{feedback}</span>
        </div>
      )}

      {tab === 'directory' ? (
        <>
          <GlassPanel as="section" className="tenant-filter-panel">
            <label className="tenant-search-field">
              <MaterialIcon name="search" />
              <input
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, email, or user ID"
                value={search}
              />
            </label>

            <label>
              <span>Role</span>
              <select
                onChange={(event) => setRole(event.target.value as CompanyRole | '')}
                value={role}
              >
                <option value="">All roles</option>
                {roleOptions.map((option) => (
                  <option key={option} value={option}>
                    {formatLabel(option)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Membership</span>
              <select
                onChange={(event) =>
                  setMembershipStatus(
                    event.target.value as CompanyMembershipStatus | '',
                  )
                }
                value={membershipStatus}
              >
                <option value="">All memberships</option>
                {membershipStatusOptions.map((option) => (
                  <option key={option} value={option}>
                    {formatLabel(option)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Account</span>
              <select
                onChange={(event) => setUserStatus(event.target.value as UserStatus | '')}
                value={userStatus}
              >
                <option value="">All accounts</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </label>
          </GlassPanel>

          <div className="tenant-directory-layout">
            {canCreateInvitations && (
              <GlassPanel as="section" className="tenant-invite-card">
                <div className="panel-heading">
                  <div>
                    <h2>Invite by Email</h2>
                    <p>Queue a secure invitation for Brevo delivery.</p>
                  </div>
                  <span className="data-source-badge">Brevo Queue</span>
                </div>

                <form onSubmit={(event) => void handleInvite(event)}>
                  <label className="form-field">
                    <span>Email address</span>
                    <div className="glass-input">
                      <MaterialIcon name="mail" />
                      <input
                        autoComplete="email"
                        onChange={(event) => setInviteEmail(event.target.value)}
                        placeholder="publisher@example.com"
                        type="email"
                        value={inviteEmail}
                      />
                    </div>
                  </label>

                  <label className="form-field">
                    <span>Initial company role</span>
                    <div className="glass-input">
                      <MaterialIcon name="manage_accounts" />
                      <select
                        onChange={(event) =>
                          setInviteRole(event.target.value as CompanyRole)
                        }
                        value={inviteRole}
                      >
                        {inviteRoleOptions.map((option) => (
                          <option key={option} value={option}>
                            {formatLabel(option)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>

                  <button
                    className="primary-gradient-button tenant-invite-submit"
                    disabled={tenant.isMutating}
                    type="submit"
                  >
                    <MaterialIcon name="person_add" />
                    Send invitation
                  </button>
                </form>

                <div className="tenant-scope-note">
                  <MaterialIcon name="info" />
                  <span>
                    Supabase generates the secure account link; Brevo delivers the email in the background. No UUID lookup is required.
                  </span>
                </div>
              </GlassPanel>
            )}

            <div className="tenant-directory-stack">
              <GlassPanel as="section" className="tenant-invitations-card">
                <div className="panel-heading">
                  <div>
                    <h2>Pending Invitations</h2>
                    <p>{pendingInvitations.length} invitations awaiting acceptance.</p>
                  </div>
                  <span className="data-source-badge">Email Flow</span>
                </div>

                {pendingInvitations.length === 0 ? (
                  <div className="tenant-empty-state tenant-empty-state--compact">
                    <MaterialIcon name="mark_email_read" />
                    <p>No pending invitations.</p>
                  </div>
                ) : (
                  <div className="tenant-invitation-list">
                    {pendingInvitations.map((invitation) => (
                      <article className="tenant-invitation-row" key={invitation.id}>
                        <div>
                          <strong>{invitation.email}</strong>
                          <span>
                            {formatLabel(invitation.role)} · {formatLabel(invitation.deliveryStatus)} · Expires {formatDate(invitation.expiresAt)}
                          </span>
                        </div>
                        {canManageInvitationRole(
                          platformRole,
                          companyRole,
                          invitation.role,
                        ) && (
                          <div className="tenant-invitation-actions">
                            <button
                              className="tenant-secondary-button"
                              disabled={tenant.isMutating}
                              onClick={() => void handleResendInvitation(invitation)}
                              type="button"
                            >
                              <MaterialIcon name="forward_to_inbox" />
                              Resend
                            </button>
                            <button
                              className="tenant-danger-button"
                              disabled={tenant.isMutating}
                              onClick={() => void handleRevokeInvitation(invitation)}
                              type="button"
                            >
                              <MaterialIcon name="cancel" />
                              Revoke
                            </button>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </GlassPanel>

              <GlassPanel as="section" className="tenant-directory-card">
              <div className="panel-heading">
                <div>
                  <h2>Company Users</h2>
                  <p>{tenant.directory.items.length} matching membership records.</p>
                </div>
                {tenant.directory.nextCursor !== null && (
                  <span className="tenant-pagination-note">More records available</span>
                )}
              </div>

              {tenant.status === 'loading' ? (
                <div className="tenant-empty-state">
                  <MaterialIcon className="spin" name="progress_activity" />
                  <p>Loading tenant directory…</p>
                </div>
              ) : tenant.directory.items.length === 0 ? (
                <div className="tenant-empty-state">
                  <MaterialIcon name="group_off" />
                  <h3>No matching company users</h3>
                  <p>Send an email invitation or change the active filters.</p>
                </div>
              ) : (
                <div className="tenant-user-list">
                  {tenant.directory.items.map((user) => (
                    <article className="tenant-user-card" key={user.membershipId}>
                      <div className="tenant-user-card__identity">
                        <div className="tenant-avatar">
                          {(user.displayName ?? user.userId).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="tenant-user-card__title">
                            <strong>{user.displayName ?? 'Unnamed User'}</strong>
                            <span className={statusClass(user.userStatus)}>
                              {formatLabel(user.userStatus)} account
                            </span>
                            <span className={statusClass(user.membershipStatus)}>
                              {formatLabel(user.membershipStatus)} membership
                            </span>
                          </div>
                          {user.email === null ? (
                            <span className="tenant-user-email">No email address</span>
                          ) : (
                            <a className="tenant-user-email" href={`mailto:${user.email}`}>
                              {user.email}
                            </a>
                          )}
                          <code title={user.userId}>{compactId(user.userId)}</code>
                          <div className="tenant-user-card__meta">
                            <span>
                              <MaterialIcon name="login" />
                              {formatDate(user.joinedAt)}
                            </span>
                            <span>
                              <MaterialIcon name="update" />
                              {formatDate(user.membershipUpdatedAt)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {canManageMemberships ? (
                        <UserAccessForm
                          canManageUserStatus={canManageUserStatus}
                          disabled={tenant.isMutating}
                          onSaveMembership={handleMembershipUpdate}
                          onToggleUserStatus={handleUserStatusUpdate}
                          user={user}
                        />
                      ) : (
                        <div className="tenant-readonly-access">
                          <MaterialIcon name="visibility" />
                          <span>{formatLabel(user.role)}</span>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
              </GlassPanel>
            </div>
          </div>
        </>
      ) : (
        <GlassPanel as="section" className="tenant-audit-card">
          <div className="panel-heading">
            <div>
              <h2>Audit Trail</h2>
              <p>Latest security and tenant mutations from the backend audit log.</p>
            </div>
            <span className="data-source-badge">Live API</span>
          </div>

          {tenant.status === 'loading' ? (
            <div className="tenant-empty-state">
              <MaterialIcon className="spin" name="progress_activity" />
              <p>Loading audit events…</p>
            </div>
          ) : tenant.audit.items.length === 0 ? (
            <div className="tenant-empty-state">
              <MaterialIcon name="history_toggle_off" />
              <h3>No audit events found</h3>
              <p>New tenant actions will appear here automatically.</p>
            </div>
          ) : (
            <div className="tenant-audit-list">
              {tenant.audit.items.map((event) => (
                <article className="tenant-audit-event" key={event.id}>
                  <div className="tenant-audit-event__icon">
                    <MaterialIcon name="shield_person" />
                  </div>
                  <div className="tenant-audit-event__body">
                    <div>
                      <strong>{formatLabel(event.eventName)}</strong>
                      <time>{formatDate(event.createdAt)}</time>
                    </div>
                    <p>{formatMetadata(event.metadata)}</p>
                    <div className="tenant-audit-event__meta">
                      <span>{formatLabel(event.entityType)}</span>
                      {event.entityId !== null && (
                        <code title={event.entityId}>{compactId(event.entityId)}</code>
                      )}
                      {event.actorUserId !== null && (
                        <span title={event.actorUserId}>
                          Actor {compactId(event.actorUserId)}
                        </span>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </GlassPanel>
      )}
    </div>
  );
}
