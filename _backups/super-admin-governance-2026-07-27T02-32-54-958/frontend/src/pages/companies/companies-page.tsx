import { type FormEvent, useMemo, useState } from 'react';

import { MaterialIcon } from '../../components/icons/material-icon';
import { GlassPanel } from '../../components/ui/glass-panel';
import { useAuth } from '../../features/auth/use-auth';
import { useCompany } from '../../features/companies/use-company';

function createSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 80);
}

function formatDate(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? 'Unknown'
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
      }).format(date);
}

export function CompaniesPage() {
  const auth = useAuth();
  const company = useCompany();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [slugEdited, setSlugEdited] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isPlatformAdmin =
    auth.identity?.authorization.platformRole === 'platform_super_admin';
  const activeCompanies = useMemo(
    () => company.companies.filter((item) => item.status === 'active'),
    [company.companies],
  );

  function handleNameChange(value: string) {
    setName(value);

    if (!slugEdited) {
      setSlug(createSlug(value));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    if (name.trim().length < 2) {
      setFormError('Company name must contain at least 2 characters.');
      return;
    }

    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) {
      setFormError('Slug must use lowercase letters, numbers, and single hyphens.');
      return;
    }

    setSubmitting(true);

    try {
      await company.createCompany({
        name,
        slug,
        timezone,
      });
      setName('');
      setSlug('');
      setSlugEdited(false);
      setTimezone('UTC');
    } catch (error: unknown) {
      setFormError(
        error instanceof Error ? error.message : 'The company could not be created.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!isPlatformAdmin) {
    return (
      <GlassPanel as="section" className="access-state-panel page-stack">
        <MaterialIcon name="lock" />
        <h1>Platform access required</h1>
        <p>Only a Platform Super Admin can manage the company directory.</p>
      </GlassPanel>
    );
  }

  return (
    <div className="companies-page page-stack">
      <GlassPanel as="section" className="page-heading-panel">
        <div>
          <span className="eyebrow-chip">
            <MaterialIcon name="domain" filled />
            Tenant Foundation
          </span>
          <h1>Companies</h1>
          <p>
            Create tenant workspaces, choose the active company context, and unlock
            company-scoped reporting and operations.
          </p>
        </div>
        <div className="page-heading-panel__stat">
          <span>Active tenants</span>
          <strong>{activeCompanies.length}</strong>
        </div>
      </GlassPanel>

      <div className="companies-layout">
        <GlassPanel as="section" className="company-create-card">
          <div className="panel-heading">
            <div>
              <h2>Create Company</h2>
              <p>The new tenant is active immediately after creation.</p>
            </div>
          </div>

          <form className="company-form" onSubmit={(event) => void handleSubmit(event)}>
            <label className="form-field">
              <span>Company name</span>
              <div className="glass-input">
                <MaterialIcon name="business" />
                <input
                  autoComplete="organization"
                  onChange={(event) => handleNameChange(event.target.value)}
                  placeholder="Example Media Group"
                  required
                  value={name}
                />
              </div>
            </label>

            <label className="form-field">
              <span>Company slug</span>
              <div className="glass-input">
                <MaterialIcon name="alternate_email" />
                <input
                  onChange={(event) => {
                    setSlugEdited(true);
                    setSlug(createSlug(event.target.value));
                  }}
                  placeholder="example-media-group"
                  required
                  value={slug}
                />
              </div>
            </label>

            <label className="form-field">
              <span>Timezone</span>
              <div className="glass-input">
                <MaterialIcon name="schedule" />
                <input
                  onChange={(event) => setTimezone(event.target.value)}
                  placeholder="UTC"
                  required
                  value={timezone}
                />
              </div>
            </label>

            {formError !== null && (
              <div className="form-error" role="alert">
                <MaterialIcon name="error" />
                <span>{formError}</span>
              </div>
            )}

            <button
              className="primary-gradient-button"
              disabled={submitting}
              type="submit"
            >
              {submitting ? 'Creating company…' : 'Create company'}
            </button>
          </form>
        </GlassPanel>

        <GlassPanel as="section" className="company-directory-card">
          <div className="panel-heading company-directory-card__heading">
            <div>
              <h2>Company Directory</h2>
              <p>{company.companies.length} tenant records available.</p>
            </div>
            <button
              className="icon-button"
              onClick={() => void company.refreshCompanies()}
              title="Refresh companies"
              type="button"
            >
              <MaterialIcon name="refresh" />
            </button>
          </div>

          {company.status === 'loading' ? (
            <div className="inline-loading-state">
              <MaterialIcon className="spin" name="progress_activity" />
              Loading companies…
            </div>
          ) : company.error !== null ? (
            <div className="inline-error-state">
              <MaterialIcon name="error" />
              <span>{company.error}</span>
            </div>
          ) : company.companies.length === 0 ? (
            <div className="empty-directory-state">
              <MaterialIcon name="domain_add" />
              <h3>No companies yet</h3>
              <p>Create the first company using the form.</p>
            </div>
          ) : (
            <div className="company-card-list">
              {company.companies.map((item) => {
                const selected = item.id === company.activeCompanyId;

                return (
                  <article
                    className={`company-card ${selected ? 'company-card--selected' : ''}`}
                    key={item.id}
                  >
                    <div className="company-card__icon">
                      <MaterialIcon name="apartment" />
                    </div>
                    <div className="company-card__content">
                      <div className="company-card__title-row">
                        <h3>{item.name}</h3>
                        <span className={`status-badge status-badge--${item.status}`}>
                          {item.status}
                        </span>
                      </div>
                      <p>{item.slug}</p>
                      <dl>
                        <div>
                          <dt>Timezone</dt>
                          <dd>{item.timezone}</dd>
                        </div>
                        <div>
                          <dt>Created</dt>
                          <dd>{formatDate(item.createdAt)}</dd>
                        </div>
                      </dl>
                    </div>
                    <button
                      className={selected ? 'glass-button' : 'company-select-button'}
                      disabled={selected || item.status !== 'active'}
                      onClick={() => void company.selectCompany(item.id)}
                      type="button"
                    >
                      {selected ? 'Selected' : 'Use company'}
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
