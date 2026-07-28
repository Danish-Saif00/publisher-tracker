import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';

import { MaterialIcon } from '../icons/material-icon';
import { useAuth } from '../../features/auth/use-auth';
import { useCompany } from '../../features/companies/use-company';
import { useApiHealth } from '../../features/system/use-api-health';

type TopbarProps = {
  onOpenNavigation: () => void;
};

function readMetadataString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function formatRole(role: string | null): string {
  if (role === null) {
    return 'Authenticated User';
  }

  return role
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export function Topbar({ onOpenNavigation }: TopbarProps) {
  const auth = useAuth();
  const company = useCompany();
  const health = useApiHealth();
  const isLive = health.isSuccess;
  const [profileOpen, setProfileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const userMetadata = auth.user?.user_metadata ?? {};
  const displayName =
    readMetadataString(userMetadata.full_name) ??
    readMetadataString(userMetadata.name) ??
    auth.user?.email ??
    'Publisher Tracker User';
  const avatarUrl =
    readMetadataString(userMetadata.avatar_url) ??
    readMetadataString(userMetadata.picture);
  const email = auth.identity?.user.email ?? auth.user?.email ?? 'Email unavailable';
  const role =
    auth.identity?.authorization.platformRole ??
    auth.identity?.authorization.companyMembership?.role ??
    null;
  const initials = displayName
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (
        profileMenuRef.current !== null &&
        event.target instanceof Node &&
        !profileMenuRef.current.contains(event.target)
      ) {
        setProfileOpen(false);
      }
    }

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  async function handleSignOut() {
    setSigningOut(true);

    try {
      await auth.signOut();
    } catch {
      // The auth context clears the local session even when the remote sign-out request fails.
    } finally {
      setSigningOut(false);
      setProfileOpen(false);
    }
  }

  async function handleCompanyChange(companyId: string) {
    setCompanyError(null);

    try {
      await company.selectCompany(companyId);
    } catch (error: unknown) {
      setCompanyError(
        error instanceof Error ? error.message : 'The company context could not be changed.',
      );
    }
  }

  return (
    <header className="app-topbar glass-panel">
      <button
        aria-label="Open navigation"
        className="icon-button app-topbar__menu"
        onClick={onOpenNavigation}
        type="button"
      >
        <MaterialIcon name="menu" />
      </button>

      <label className="global-search">
        <MaterialIcon name="search" />
        <input aria-label="Global search" placeholder="Search data, partners, or links..." />
      </label>

      <div className="app-topbar__actions">
        {company.companies.length > 0 ? (
          <label className="company-context-selector" title={companyError ?? undefined}>
            <MaterialIcon name="domain" />
            <select
              aria-label="Active company"
              onChange={(event) => void handleCompanyChange(event.target.value)}
              value={company.activeCompanyId ?? ''}
            >
              <option disabled value="">
                Select company
              </option>
              {company.companies.map((item) => (
                <option disabled={item.status !== 'active'} key={item.id} value={item.id}>
                  {item.name}{item.status === 'active' ? '' : ` (${item.status})`}
                </option>
              ))}
            </select>
            <MaterialIcon name="expand_more" />
          </label>
        ) : auth.identity?.authorization.platformRole === 'platform_super_admin' ? (
          <Link className="company-context-empty" to="/companies">
            <MaterialIcon name="domain_add" />
            <span>Create company</span>
          </Link>
        ) : null}

        <div className={`system-status ${isLive ? 'system-status--live' : 'system-status--offline'}`}>
          <span className="system-status__dot" />
          <span>{health.isLoading ? 'Checking API' : isLive ? 'System Live' : 'API Offline'}</span>
        </div>

        <button aria-label="Notifications" className="icon-button notification-button" type="button">
          <MaterialIcon name="notifications" />
          <span className="notification-button__badge" />
        </button>

        <div className="profile-menu" ref={profileMenuRef}>
          <button
            aria-expanded={profileOpen}
            aria-haspopup="menu"
            aria-label="Open profile menu"
            className="profile-button"
            onClick={() => setProfileOpen((open) => !open)}
            type="button"
          >
            {avatarUrl === null ? (
              <span className="profile-button__initials">{initials || 'PT'}</span>
            ) : (
              <img alt={displayName} src={avatarUrl} />
            )}
          </button>

          {profileOpen && (
            <div className="profile-popover glass-panel specular-panel" role="menu">
              <div className="profile-popover__identity">
                <strong>{displayName}</strong>
                <span>{email}</span>
              </div>

              <div className="profile-popover__verification">
                <MaterialIcon name="verified_user" />
                <span>
                  <strong>API verified</strong>
                  {formatRole(role)}
                </span>
              </div>

              {company.activeCompany !== null && (
                <div className="profile-popover__company">
                  <MaterialIcon name="domain" />
                  <span>
                    <strong>{company.activeCompany.name}</strong>
                    Active company context
                  </span>
                </div>
              )}

              <button
                className="profile-popover__action"
                disabled={signingOut}
                onClick={() => void handleSignOut()}
                role="menuitem"
                type="button"
              >
                <MaterialIcon
                  {...(signingOut ? { className: 'spin' } : {})}
                  name={signingOut ? 'progress_activity' : 'logout'}
                />
                <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
