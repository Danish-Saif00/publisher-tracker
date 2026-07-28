import { type FormEvent, useMemo, useState } from 'react';

import { MaterialIcon } from '../../components/icons/material-icon';
import { GlassPanel } from '../../components/ui/glass-panel';
import { useTenantAdministration } from '../../features/tenant-administration/use-tenant-administration';
import { useNetworkAccounts } from '../../features/tracking-networks/use-tracking-networks';
import type {
  Offer,
  OfferAssignmentStatus,
  OfferStatus,
} from '../../features/control-plane/control-plane.types';
import {
  useOfferAssignments,
  useOffers,
} from '../../features/control-plane/use-control-plane';
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
import {
  formatDateTime,
  formatMinorAmount,
} from '../control-plane/control-plane-formatters';

function OfferEditor({
  offer,
  selected,
  disabled,
  canManage,
  onSelect,
  onUpdate,
}: {
  offer: Offer;
  selected: boolean;
  disabled: boolean;
  canManage: boolean;
  onSelect: (offerId: string) => void;
  onUpdate: (input: {
    offerId: string;
    externalOfferId: string | null;
    name: string;
    description: string | null;
    destinationUrl: string;
    status: OfferStatus;
  }) => Promise<void>;
}) {
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const externalOfferId = String(formData.get('externalOfferId') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();

    await onUpdate({
      offerId: offer.id,
      externalOfferId: externalOfferId.length === 0 ? null : externalOfferId,
      name: String(formData.get('name') ?? ''),
      description: description.length === 0 ? null : description,
      destinationUrl: String(formData.get('destinationUrl') ?? ''),
      status: String(formData.get('status') ?? offer.status) as OfferStatus,
    });
  }

  return (
    <article className={`control-record ${selected ? 'control-record--selected' : ''}`}>
      <button
        className="control-record__summary"
        onClick={() => onSelect(offer.id)}
        type="button"
      >
        <span className="control-record-icon">
          <MaterialIcon name="local_offer" />
        </span>
        <span>
          <strong>{offer.name}</strong>
          <small>
            {offer.code} · {offer.providerName} · Updated {formatDateTime(offer.updatedAt)}
          </small>
        </span>
        <ControlStatus status={offer.status} />
      </button>

      <div className="control-meta-grid control-meta-grid--three">
        <div>
          <span>Network account</span>
          <strong>{offer.networkAccountName}</strong>
        </div>
        <div>
          <span>External offer ID</span>
          <strong>{offer.externalOfferId ?? 'Not configured'}</strong>
        </div>
        <div>
          <span>Destination</span>
          <a href={offer.destinationUrl} rel="noreferrer" target="_blank">
            {offer.destinationUrl}
          </a>
        </div>
      </div>

      {canManage && offer.status !== 'archived' && (
        <form className="control-inline-editor" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            <span>Name</span>
            <input defaultValue={offer.name} disabled={disabled} name="name" required />
          </label>
          <label>
            <span>External ID</span>
            <input
              defaultValue={offer.externalOfferId ?? ''}
              disabled={disabled}
              name="externalOfferId"
            />
          </label>
          <label className="control-field--wide">
            <span>Destination URL</span>
            <input
              defaultValue={offer.destinationUrl}
              disabled={disabled}
              name="destinationUrl"
              required
              type="url"
            />
          </label>
          <label className="control-field--wide">
            <span>Description</span>
            <input
              defaultValue={offer.description ?? ''}
              disabled={disabled}
              name="description"
            />
          </label>
          <label>
            <span>Status</span>
            <select defaultValue={offer.status} disabled={disabled} name="status">
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <button className="control-secondary-button" disabled={disabled} type="submit">
            <MaterialIcon name="save" />
            Save offer
          </button>
        </form>
      )}
    </article>
  );
}

export function OffersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<OfferStatus | 'all'>('all');
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const offers = useOffers(status === 'all' ? {} : { status });
  const accounts = useNetworkAccounts();
  const tenant = useTenantAdministration({
    search: '',
    role: '',
    membershipStatus: '',
    userStatus: '',
  });
  const assignments = useOfferAssignments(selectedOfferId);
  const activeAccounts = useMemo(
    () => accounts.accounts.filter((account) => account.status === 'active'),
    [accounts.accounts],
  );
  const assignableMembers = useMemo(
    () =>
      tenant.directory.items.filter(
        (member) =>
          member.membershipStatus === 'active' &&
          member.userStatus === 'active' &&
          (member.role === 'manager' || member.role === 'publisher'),
      ),
    [tenant.directory.items],
  );
  const filteredOffers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return offers.offers.filter(
      (offer) =>
        normalizedSearch.length === 0 ||
        offer.name.toLowerCase().includes(normalizedSearch) ||
        offer.code.toLowerCase().includes(normalizedSearch) ||
        offer.providerName.toLowerCase().includes(normalizedSearch),
    );
  }, [offers.offers, search]);
  const selectedOffer = offers.offers.find((offer) => offer.id === selectedOfferId) ?? null;

  async function handleCreateOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setActionError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const externalOfferId = String(formData.get('externalOfferId') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();

    try {
      const created = await offers.createOffer({
        networkAccountId: String(formData.get('networkAccountId') ?? ''),
        code: String(formData.get('code') ?? ''),
        name: String(formData.get('name') ?? ''),
        destinationUrl: String(formData.get('destinationUrl') ?? ''),
        externalOfferId: externalOfferId.length === 0 ? null : externalOfferId,
        description: description.length === 0 ? null : description,
      });
      form.reset();
      setSelectedOfferId(created.id);
      setFeedback(`${created.name} was added to the offer catalog.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The offer could not be created.');
    }
  }

  async function handleUpdateOffer(input: Parameters<typeof offers.updateOffer>[0]) {
    setFeedback(null);
    setActionError(null);

    try {
      const updated = await offers.updateOffer(input);
      setFeedback(`${updated.name} was updated.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The offer could not be updated.');
    }
  }

  async function handleCreateAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedOfferId === null) return;
    setFeedback(null);
    setActionError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const amountValue = String(formData.get('manualPayoutAmountMinor') ?? '').trim();
    const currency = String(formData.get('manualPayoutCurrency') ?? '').trim();

    try {
      const assignment = await assignments.createAssignment({
        offerId: selectedOfferId,
        membershipId: String(formData.get('membershipId') ?? ''),
        ...(amountValue.length > 0
          ? { manualPayoutAmountMinor: Number.parseInt(amountValue, 10) }
          : {}),
        ...(currency.length > 0 ? { manualPayoutCurrency: currency } : {}),
      });
      form.reset();
      setFeedback(`The ${assignment.role} assignment is active.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The assignment could not be created.');
    }
  }

  async function handleAssignmentStatus(
    assignmentId: string,
    nextStatus: OfferAssignmentStatus,
  ) {
    if (selectedOfferId === null) return;
    setFeedback(null);
    setActionError(null);

    try {
      await assignments.updateAssignment({
        offerId: selectedOfferId,
        assignmentId,
        status: nextStatus,
      });
      setFeedback(`Assignment status changed to ${nextStatus}.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The assignment could not be updated.');
    }
  }

  if (offers.status === 'forbidden') {
    return (
      <ControlAccessDenied
        message="Your current role does not have access to company offers."
        title="Offers unavailable"
      />
    );
  }

  if (offers.status === 'loading' || offers.status === 'idle') {
    return <ControlLoading label="offers" />;
  }

  return (
    <div className="control-page">
      <ControlModuleHeader
        description={
          <>
            Manage commercial offers, publisher visibility and assignment scope for{' '}
            <strong>{offers.companyName}</strong>.
          </>
        }
        eyebrow="Commercial Catalog"
        icon="local_offer"
        stats={[
          { label: 'Total', value: offers.offers.length },
          {
            label: 'Active',
            value: offers.offers.filter((offer) => offer.status === 'active').length,
          },
          { label: 'Assignments', value: assignments.assignments.length },
        ]}
        title="Offers & Assignments"
      />

      <ControlFeedback error={actionError ?? offers.error ?? assignments.error} message={feedback} />

      <div className="control-layout-grid">
        {offers.permissions.canManageOffers && (
          <GlassPanel as="section" className="control-side-card">
            <ControlCardHeading
              description="Link an offer to an active network account."
              eyebrow="Offer Setup"
              title="Add offer"
            />
            <form className="control-form" onSubmit={(event) => void handleCreateOffer(event)}>
              <label>
                <span>Network account</span>
                <select disabled={offers.isMutating} name="networkAccountId" required>
                  <option value="">Select account</option>
                  {activeAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name} · {account.providerName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Offer code</span>
                <input name="code" placeholder="summer_offer" required spellCheck={false} />
              </label>
              <label>
                <span>Offer name</span>
                <input name="name" placeholder="Summer Offer" required />
              </label>
              <label>
                <span>External offer ID</span>
                <input name="externalOfferId" placeholder="Optional provider ID" />
              </label>
              <label>
                <span>Destination URL</span>
                <input name="destinationUrl" placeholder="https://advertiser.example" required type="url" />
              </label>
              <label>
                <span>Description</span>
                <textarea name="description" placeholder="Internal offer notes" rows={3} />
              </label>
              <button className="primary-gradient-button" disabled={offers.isMutating} type="submit">
                <MaterialIcon name="add_circle" />
                Add offer
              </button>
            </form>
          </GlassPanel>
        )}

        <GlassPanel
          as="section"
          className={`control-main-card ${offers.permissions.canManageOffers ? '' : 'control-main-card--full'}`}
        >
          <ControlCardHeading
            action={
              <RefreshButton
                disabled={offers.isMutating}
                onClick={() => void offers.refresh()}
              />
            }
            description={`${filteredOffers.length} matching offers.`}
            eyebrow="Offer Directory"
            title="Available offers"
          />
          <div className="control-filter-bar">
            <label>
              <MaterialIcon name="search" />
              <input
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search offer, code or provider"
                value={search}
              />
            </label>
            <select
              onChange={(event) => setStatus(event.target.value as OfferStatus | 'all')}
              value={status}
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          <div className="control-record-list">
            {filteredOffers.length === 0 ? (
              <ControlEmpty
                icon="local_offer"
                message="Add an offer or change the current filters."
                title="No matching offers"
              />
            ) : (
              filteredOffers.map((offer) => (
                <OfferEditor
                  canManage={offers.permissions.canManageOffers}
                  disabled={offers.isMutating}
                  key={offer.id}
                  offer={offer}
                  onSelect={(offerId) => setSelectedOfferId(offerId)}
                  onUpdate={handleUpdateOffer}
                  selected={selectedOfferId === offer.id}
                />
              ))
            )}
          </div>
        </GlassPanel>

        <GlassPanel as="section" className="control-main-card control-main-card--full">
          <ControlCardHeading
            description={
              selectedOffer === null
                ? 'Select an offer to manage its manager and publisher assignments.'
                : `Access rules and resolved payouts for ${selectedOffer.name}.`
            }
            eyebrow="Scoped Access"
            title="Offer assignments"
          />

          {selectedOffer === null ? (
            <ControlEmpty
              icon="group_add"
              message="Choose an offer from the directory above."
              title="No offer selected"
            />
          ) : (
            <>
              {offers.permissions.canManageOffers && (
                <form className="control-assignment-form" onSubmit={(event) => void handleCreateAssignment(event)}>
                  <label>
                    <span>Manager or publisher</span>
                    <select name="membershipId" required>
                      <option value="">Select member</option>
                      {assignableMembers.map((member) => (
                        <option key={member.membershipId} value={member.membershipId}>
                          {member.displayName ?? member.email ?? member.userId.slice(0, 8)} · {member.role}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Manual payout (minor units)</span>
                    <input min="0" name="manualPayoutAmountMinor" placeholder="Optional" type="number" />
                  </label>
                  <label>
                    <span>Currency</span>
                    <input maxLength={3} name="manualPayoutCurrency" placeholder="USD" />
                  </label>
                  <button className="control-secondary-button" disabled={assignments.isMutating} type="submit">
                    <MaterialIcon name="person_add" />
                    Assign offer
                  </button>
                </form>
              )}

              <div className="control-table-wrap">
                <table className="control-table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Resolved payout</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.assignments.map((assignment) => (
                      <tr key={assignment.id}>
                        <td>{assignment.userId.slice(0, 12)}</td>
                        <td>{assignment.role}</td>
                        <td><ControlStatus status={assignment.status} /></td>
                        <td>
                          {formatMinorAmount(
                            assignment.resolvedPayoutAmountMinor,
                            assignment.resolvedPayoutCurrency,
                          )}
                        </td>
                        <td>
                          {offers.permissions.canManageOffers && assignment.status !== 'revoked' ? (
                            <select
                              disabled={assignments.isMutating}
                              onChange={(event) =>
                                void handleAssignmentStatus(
                                  assignment.id,
                                  event.target.value as OfferAssignmentStatus,
                                )
                              }
                              value={assignment.status}
                            >
                              <option value="active">Active</option>
                              <option value="paused">Paused</option>
                              <option value="revoked">Revoked</option>
                            </select>
                          ) : (
                            'Read only'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {assignments.assignments.length === 0 && (
                  <ControlEmpty
                    icon="group_off"
                    message="No manager or publisher has been assigned to this offer."
                    title="No assignments"
                  />
                )}
              </div>
            </>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
