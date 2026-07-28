import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';

import { BrandMark } from '../../components/brand/brand-mark';
import { MaterialIcon } from '../../components/icons/material-icon';
import { useAuth } from '../../features/auth/use-auth';
import { useCompany } from '../../features/companies/use-company';
import {
  acceptInvitation,
  previewInvitation,
} from '../../features/invitations/invitation-api';
import type { InvitationPreview } from '../../features/invitations/invitation.types';

function formatRole(value: string): string {
  return value
    .split('_')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function formatExpiry(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'The invitation could not be processed.';
}

export function AcceptInvitationPage() {
  const auth = useAuth();
  const company = useCompany();
  const navigate = useNavigate();
  const [searchParameters] = useSearchParams();
  const token = useMemo(
    () => searchParameters.get('token')?.trim() ?? '',
    [searchParameters],
  );
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const session = auth.session;

  const invitationQuery = useQuery<InvitationPreview>({
    queryKey: ['invitation-preview', token, session?.user.id ?? null],
    enabled: token.length > 0 && session !== null,
    queryFn: ({ signal }) => {
      if (session === null) {
        throw new Error('An authenticated invitation session is required.');
      }

      return previewInvitation(session.access_token, token, signal);
    },
    retry: false,
  });

  if (token.length === 0) {
    return <Navigate replace to="/dashboard" />;
  }

  async function handleAccept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);

    if (session === null || invitationQuery.data === undefined) {
      setActionError('The invitation session is not ready.');
      return;
    }

    if (invitationQuery.data.requiresPasswordSetup) {
      if (password.length < 8) {
        setActionError('Create a password containing at least 8 characters.');
        return;
      }

      if (password !== confirmation) {
        setActionError('The password confirmation does not match.');
        return;
      }
    }

    setSubmitting(true);

    try {
      if (invitationQuery.data.requiresPasswordSetup) {
        await auth.updatePassword(password);
      }

      const result = await acceptInvitation(session.access_token, token);
      await company.activateCompanyContext(result.company.id);
      navigate('/dashboard', { replace: true });
    } catch (error: unknown) {
      setActionError(getErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  }

  const previewError = invitationQuery.error
    ? getErrorMessage(invitationQuery.error)
    : null;
  const displayedError = actionError ?? previewError;

  return (
    <main className="invitation-page">
      <div className="login-orb login-orb--violet" />
      <div className="login-orb login-orb--orange" />

      <section className="invitation-card glass-panel specular-panel">
        <div className="invitation-card__brand">
          <BrandMark />
        </div>

        {invitationQuery.isLoading ? (
          <div className="invitation-state">
            <MaterialIcon className="spin" name="progress_activity" />
            <h1>Verifying invitation</h1>
            <p>Publisher Tracker is validating your secure access link.</p>
          </div>
        ) : invitationQuery.data === undefined ? (
          <div className="invitation-state invitation-state--error">
            <MaterialIcon name="link_off" />
            <h1>Invitation unavailable</h1>
            <p>{displayedError ?? 'This invitation link is invalid or expired.'}</p>
            <button
              className="tenant-secondary-button"
              onClick={() => navigate('/dashboard', { replace: true })}
              type="button"
            >
              Continue to dashboard
            </button>
          </div>
        ) : (
          <>
            <div className="invitation-heading">
              <span className="eyebrow-chip">
                <MaterialIcon name="verified_user" filled />
                Secure Invitation
              </span>
              <h1>Join {invitationQuery.data.company.name}</h1>
              <p>
                Accept access as{' '}
                <strong>{formatRole(invitationQuery.data.role)}</strong> using{' '}
                <strong>{invitationQuery.data.email}</strong>.
              </p>
            </div>

            <div className="invitation-summary">
              <div>
                <span>Company</span>
                <strong>{invitationQuery.data.company.name}</strong>
              </div>
              <div>
                <span>Role</span>
                <strong>{formatRole(invitationQuery.data.role)}</strong>
              </div>
              <div>
                <span>Expires</span>
                <strong>{formatExpiry(invitationQuery.data.expiresAt)}</strong>
              </div>
            </div>

            <form className="invitation-form" onSubmit={(event) => void handleAccept(event)}>
              {invitationQuery.data.requiresPasswordSetup && (
                <>
                  <label className="form-field">
                    <span>Create password</span>
                    <div className="glass-input">
                      <MaterialIcon name="lock" />
                      <input
                        autoComplete="new-password"
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="At least 8 characters"
                        required
                        type="password"
                        value={password}
                      />
                    </div>
                  </label>

                  <label className="form-field">
                    <span>Confirm password</span>
                    <div className="glass-input">
                      <MaterialIcon name="lock_reset" />
                      <input
                        autoComplete="new-password"
                        onChange={(event) => setConfirmation(event.target.value)}
                        placeholder="Repeat your password"
                        required
                        type="password"
                        value={confirmation}
                      />
                    </div>
                  </label>
                </>
              )}

              {displayedError !== null && (
                <div className="form-error" role="alert">
                  <MaterialIcon name="error" />
                  <span>{displayedError}</span>
                </div>
              )}

              <button
                className="primary-gradient-button"
                disabled={submitting}
                type="submit"
              >
                {submitting ? (
                  <MaterialIcon className="spin" name="progress_activity" />
                ) : (
                  <>
                    <MaterialIcon name="how_to_reg" />
                    Accept invitation
                  </>
                )}
              </button>
            </form>

            <p className="invitation-security-note">
              <MaterialIcon name="shield_lock" />
              This link is tied to your authenticated email and can be used only once.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
