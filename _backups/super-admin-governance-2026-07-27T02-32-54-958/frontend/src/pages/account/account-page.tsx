import {
  useState,
  type FormEvent,
} from 'react';

import { MaterialIcon } from '../../components/icons/material-icon';
import { GlassPanel } from '../../components/ui/glass-panel';
import { useAuth } from '../../features/auth/use-auth';
import type { AccountProfile } from '../../features/final-operations/final-operations.types';
import { useAccountProfile } from '../../features/final-operations/use-final-operations';
import { supabase } from '../../lib/supabase';
import { formatDateTime } from '../control-plane/control-plane-formatters';
import {
  ControlCardHeading,
  ControlFeedback,
  ControlLoading,
  ControlModuleHeader,
  RefreshButton,
} from '../control-plane/control-plane-ui';

const TIMEZONE_SUGGESTIONS = Object.freeze([
  'UTC',
  'Asia/Karachi',
  'Asia/Dubai',
  'Asia/Kuwait',
  'Asia/Riyadh',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
]);

type ProfileFormProps = {
  profile: AccountProfile;
  disabled: boolean;
  onSubmit: (input: {
    displayName: string | null;
    timezone: string;
  }) => Promise<void>;
};

function ProfileForm({
  profile,
  disabled,
  onSubmit,
}: ProfileFormProps) {
  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const data = new FormData(event.currentTarget);
    const displayName = String(
      data.get('displayName') ?? '',
    ).trim();
    const timezone = String(
      data.get('timezone') ?? '',
    ).trim();

    if (timezone.length === 0) {
      return;
    }

    await onSubmit({
      displayName:
        displayName.length === 0
          ? null
          : displayName,
      timezone,
    });
  }

  return (
    <form
      className="control-form account-form"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <label>
        <span>Name</span>
        <input
          autoComplete="name"
          defaultValue={profile.displayName ?? ''}
          maxLength={120}
          name="displayName"
          placeholder="Your display name"
        />
      </label>

      <label>
        <span>Timezone</span>
        <input
          defaultValue={profile.timezone}
          list="account-timezones"
          maxLength={64}
          name="timezone"
          placeholder="Asia/Karachi"
          required
        />
        <datalist id="account-timezones">
          {TIMEZONE_SUGGESTIONS.map((timezone) => (
            <option
              key={timezone}
              value={timezone}
            />
          ))}
        </datalist>
      </label>

      <button
        className="primary-gradient-button"
        disabled={disabled}
        type="submit"
      >
        <MaterialIcon name="save" />
        {disabled ? 'Updating…' : 'Update profile'}
      </button>
    </form>
  );
}

export function AccountPage() {
  const auth = useAuth();
  const account = useAccountProfile();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [updatingAuth, setUpdatingAuth] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  if (
    account.status === 'loading' ||
    account.status === 'idle'
  ) {
    return <ControlLoading label="account profile" />;
  }

  const profile = account.profile;

  async function handleProfileUpdate(input: {
    displayName: string | null;
    timezone: string;
  }): Promise<void> {
    setFeedback(null);
    setActionError(null);
    account.resetUpdateError();

    try {
      const updatedProfile = await account.updateProfile(input);
      setFeedback(
        `Profile updated. Times are now shown using ${updatedProfile.timezone}.`,
      );
    } catch (error: unknown) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'The profile could not be updated.',
      );
    }
  }

  async function handleEmailUpdate(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setFeedback(null);
    setActionError(null);
    setUpdatingAuth(true);

    try {
      const data = new FormData(event.currentTarget);
      const email = String(
        data.get('email') ?? '',
      )
        .trim()
        .toLowerCase();

      if (email.length === 0) {
        throw new Error('Email address is required.');
      }

      if (
        profile !== null &&
        email === profile.email.toLowerCase()
      ) {
        throw new Error(
          'Enter a different email address.',
        );
      }

      const { error } = await supabase.auth.updateUser({
        email,
      });

      if (error !== null) {
        throw error;
      }

      setFeedback(
        'Email change requested. Confirm the verification messages sent by the authentication service before the new address becomes active.',
      );
    } catch (error: unknown) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'The email address could not be updated.',
      );
    } finally {
      setUpdatingAuth(false);
    }
  }

  async function handlePasswordUpdate(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setFeedback(null);
    setActionError(null);
    setUpdatingAuth(true);

    try {
      const form = event.currentTarget;
      const data = new FormData(form);
      const password = String(
        data.get('password') ?? '',
      );
      const confirmation = String(
        data.get('passwordConfirmation') ?? '',
      );

      if (password.length < 12) {
        throw new Error(
          'Use a password with at least 12 characters.',
        );
      }

      if (password !== confirmation) {
        throw new Error(
          'Password confirmation does not match.',
        );
      }

      await auth.updatePassword(password);
      form.reset();
      setFeedback('Password updated successfully.');
    } catch (error: unknown) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'The password could not be updated.',
      );
    } finally {
      setUpdatingAuth(false);
    }
  }

  return (
    <div className="control-page account-page">
      <ControlModuleHeader
        description="Manage your verified identity, display preferences, and account security."
        eyebrow="Personal Settings"
        icon="manage_accounts"
        stats={[
          {
            label: 'Email',
            value:
              profile?.email ??
              auth.user?.email ??
              'Unavailable',
          },
          {
            label: 'Timezone',
            value: profile?.timezone ?? 'UTC',
          },
          {
            label: 'Last updated',
            value:
              profile === null
                ? 'Unavailable'
                : formatDateTime(profile.updatedAt),
          },
        ]}
        title="Account"
      />

      <ControlFeedback
        error={actionError ?? account.error}
        message={feedback}
      />

      {profile === null ? (
        <GlassPanel
          as="section"
          className="control-main-card control-main-card--full"
        >
          <ControlCardHeading
            action={
              <RefreshButton
                disabled={account.isUpdating}
                onClick={() => void account.refresh()}
              />
            }
            description="The API did not return an account profile."
            eyebrow="Profile unavailable"
            title="Account data could not be loaded"
          />
        </GlassPanel>
      ) : (
        <div className="account-grid">
          <GlassPanel
            as="section"
            className="control-main-card"
          >
            <ControlCardHeading
              action={
                <RefreshButton
                  disabled={
                    account.isUpdating ||
                    updatingAuth
                  }
                  onClick={() => void account.refresh()}
                />
              }
              description="Update your name and IANA timezone. Empty names fall back to your verified email."
              eyebrow="Profile"
              title="Personal details"
            />
            <ProfileForm
              disabled={
                account.isUpdating ||
                updatingAuth
              }
              key={profile.updatedAt}
              onSubmit={handleProfileUpdate}
              profile={profile}
            />
          </GlassPanel>

          <GlassPanel
            as="section"
            className="control-main-card"
          >
            <ControlCardHeading
              description="Changing your email requires verification before the new address becomes active."
              eyebrow="Verified identity"
              title="Email address"
            />
            <form
              className="control-form account-form"
              onSubmit={(event) => void handleEmailUpdate(event)}
            >
              <label>
                <span>Current email</span>
                <input
                  disabled
                  value={profile.email}
                />
              </label>
              <label>
                <span>New email</span>
                <input
                  autoComplete="email"
                  name="email"
                  placeholder="name@example.com"
                  required
                  type="email"
                />
              </label>
              <button
                className="secondary-button"
                disabled={
                  account.isUpdating ||
                  updatingAuth
                }
                type="submit"
              >
                <MaterialIcon name="mark_email_read" />
                Request email change
              </button>
            </form>
          </GlassPanel>

          <GlassPanel
            as="section"
            className="control-main-card"
          >
            <ControlCardHeading
              description="Use a unique password with at least 12 characters."
              eyebrow="Security"
              title="Change password"
            />
            <form
              className="control-form account-form"
              onSubmit={(event) => void handlePasswordUpdate(event)}
            >
              <label>
                <span>New password</span>
                <span className="account-password-field">
                  <input
                    autoComplete="new-password"
                    minLength={12}
                    name="password"
                    required
                    type={passwordVisible ? 'text' : 'password'}
                  />
                  <button
                    aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                    className="icon-button account-password-field__toggle"
                    onClick={() => setPasswordVisible((visible) => !visible)}
                    type="button"
                  >
                    <MaterialIcon name={passwordVisible ? 'visibility_off' : 'visibility'} />
                  </button>
                </span>
              </label>
              <label>
                <span>Confirm password</span>
                <span className="account-password-field">
                  <input
                    autoComplete="new-password"
                    minLength={12}
                    name="passwordConfirmation"
                    required
                    type={passwordVisible ? 'text' : 'password'}
                  />
                  <button
                    aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                    className="icon-button account-password-field__toggle"
                    onClick={() => setPasswordVisible((visible) => !visible)}
                    type="button"
                  >
                    <MaterialIcon name={passwordVisible ? 'visibility_off' : 'visibility'} />
                  </button>
                </span>
              </label>
              <button
                className="secondary-button"
                disabled={
                  account.isUpdating ||
                  updatingAuth
                }
                type="submit"
              >
                <MaterialIcon name="password" />
                {updatingAuth
                  ? 'Updating…'
                  : 'Update password'}
              </button>
            </form>
          </GlassPanel>
        </div>
      )}
    </div>
  );
}
