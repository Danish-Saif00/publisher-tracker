import { useMemo, useState } from "react";
import { Link } from "react-router";

import { MaterialIcon } from "../../components/icons/material-icon";
import { GlassPanel } from "../../components/ui/glass-panel";
import {
  copyOfferShareValue,
  formatOfferCountries,
  formatOfferDevices,
  type OfferShareMode,
} from "../../features/offers/offer-share-content";
import type { PublisherOffer } from "../../features/publisher-workspace/publisher-workspace.types";
import { usePublisherOffers } from "../../features/publisher-workspace/use-publisher-offers";
import {
  ControlEmpty,
  ControlFeedback,
  ControlLoading,
} from "../control-plane/control-plane-ui";

function formatUpdatedAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatPayout(offer: PublisherOffer): string {
  if (offer.payoutAmountMinor === null || offer.payoutCurrency === null) {
    return "Not configured";
  }

  const fractionDigits =
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: offer.payoutCurrency,
    }).resolvedOptions().maximumFractionDigits ?? 2;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: offer.payoutCurrency,
  }).format(offer.payoutAmountMinor / 10 ** fractionDigits);
}

function formatSchedule(offer: PublisherOffer): string {
  const days = offer.activeDays.join(", ");
  const time =
    offer.activeStartTime === null || offer.activeEndTime === null
      ? "All day"
      : `${offer.activeStartTime.slice(0, 5)}–${offer.activeEndTime.slice(0, 5)}`;

  return `Days ${days} · ${time} · ${offer.timezone}`;
}

export function PublisherOffersPage() {
  const publisherOffers = usePublisherOffers();
  const [search, setSearch] = useState("");
  const [shareModes, setShareModes] = useState<
    Readonly<Record<string, OfferShareMode>>
  >({});
  const [copiedOfferId, setCopiedOfferId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  const filteredOffers = useMemo(() => {
    const needle = search.trim().toLowerCase();

    if (needle.length === 0) {
      return publisherOffers.offers;
    }

    return publisherOffers.offers.filter(
      (offer) =>
        offer.name.toLowerCase().includes(needle) ||
        offer.publicId.toString().includes(needle) ||
        offer.countries.some((country) =>
          country.toLowerCase().includes(needle),
        ) ||
        offer.trackingDomainHostname?.toLowerCase().includes(needle) === true,
    );
  }, [publisherOffers.offers, search]);

  async function copyOffer(offer: PublisherOffer): Promise<void> {
    const mode = shareModes[offer.id] ?? "link";
    const value = mode === "text" ? offer.promotionalText : offer.trackingLink;

    setCopyError(null);
    setCopiedOfferId(null);

    if (value === null) {
      setCopyError(
        mode === "text"
          ? "Promotional text is unavailable until the tracking link is active."
          : "The tracking link is unavailable until the Offer Domain and assignment are active.",
      );
      return;
    }

    try {
      await copyOfferShareValue(value);
      setCopiedOfferId(offer.id);
    } catch (error: unknown) {
      setCopyError(
        error instanceof Error
          ? error.message
          : "The Offer content could not be copied.",
      );
    }
  }

  if (publisherOffers.status === "forbidden") {
    return (
      <GlassPanel as="section" className="dashboard-setup-state">
        <MaterialIcon name="local_offer" />
        <h1>Assigned Offers unavailable</h1>
        <p>An active Publisher membership is required.</p>
      </GlassPanel>
    );
  }

  if (
    publisherOffers.status === "idle" ||
    publisherOffers.status === "loading"
  ) {
    return <ControlLoading label="Assigned Offers" />;
  }

  return (
    <div className="page-stack publisher-offers-page">
      <header className="publisher-workspace-heading">
        <div>
          <span className="eyebrow-chip">
            <MaterialIcon name="local_offer" />
            Publisher Workspace
          </span>
          <h1>Assigned Offers</h1>
          <p>
            Every active assignment includes its generated tracking link and
            promotional text. No separate tracking-link creation is required.
          </p>
        </div>

        <button
          className="control-icon-button"
          disabled={publisherOffers.isRefreshing}
          onClick={() => void publisherOffers.refresh()}
          title="Refresh assigned Offers"
          type="button"
        >
          <MaterialIcon
            className={publisherOffers.isRefreshing ? "spin" : undefined}
            name="refresh"
          />
        </button>
      </header>

      <ControlFeedback
        error={copyError ?? publisherOffers.error}
        message={
          copiedOfferId === null ? null : "Selected Offer content copied."
        }
      />

      <GlassPanel as="section" className="publisher-offers-toolbar">
        <label>
          <span>Search assigned Offers</span>
          <div className="publisher-offers-toolbar__search">
            <MaterialIcon name="search" />
            <input
              onChange={(event) => setSearch(event.currentTarget.value)}
              placeholder="Offer name, public ID, country, or Domain"
              type="search"
              value={search}
            />
          </div>
        </label>
        <div>
          <span>Active assignments</span>
          <strong>{publisherOffers.offers.length}</strong>
        </div>
      </GlassPanel>

      {filteredOffers.length === 0 ? (
        <GlassPanel as="section" className="control-card">
          <ControlEmpty
            icon="local_offer"
            message={
              publisherOffers.offers.length === 0
                ? "Your Manager has not assigned an active Offer yet."
                : "No assigned Offer matches the current search."
            }
            title={
              publisherOffers.offers.length === 0
                ? "No assigned Offers"
                : "No matching Offers"
            }
          />
        </GlassPanel>
      ) : (
        <section aria-label="Assigned Offers" className="publisher-offer-grid">
          {filteredOffers.map((offer) => {
            const shareMode = shareModes[offer.id] ?? "link";
            const selectedValue =
              shareMode === "text" ? offer.promotionalText : offer.trackingLink;

            return (
              <GlassPanel
                as="article"
                className="publisher-offer-card"
                key={offer.id}
              >
                <details className="offer-collapsible-card">
                  <summary>
                    <div>
                      <span>Offer #{offer.publicId}</span>
                      <h2>{offer.name}</h2>
                    </div>
                    <MaterialIcon name="expand_more" />
                  </summary>

                  <div className="offer-collapsible-card__body">
                    {offer.description !== null && <p>{offer.description}</p>}

                    <div className="offer-share-control">
                      <label>
                        <span>Copy content</span>
                        <select
                          onChange={(event) =>
                            setShareModes((current) => ({
                              ...current,
                              [offer.id]: event.currentTarget
                                .value as OfferShareMode,
                            }))
                          }
                          value={shareMode}
                        >
                          <option value="link">Tracking link</option>
                          <option value="text">Promotional text</option>
                        </select>
                      </label>
                      <code>{selectedValue ?? "Unavailable"}</code>
                      <button
                        className="primary-gradient-button primary-gradient-button--compact"
                        disabled={selectedValue === null}
                        onClick={() => void copyOffer(offer)}
                        type="button"
                      >
                        <MaterialIcon name="content_copy" />
                        Copy
                      </button>
                    </div>

                    <dl className="publisher-offer-card__details">
                      <div>
                        <dt>Publisher ID</dt>
                        <dd>{offer.publisherPublicId}</dd>
                      </div>
                      <div>
                        <dt>Countries</dt>
                        <dd>{formatOfferCountries(offer.countries)}</dd>
                      </div>
                      <div>
                        <dt>Devices</dt>
                        <dd>{formatOfferDevices(offer.devices)}</dd>
                      </div>
                      <div>
                        <dt>Tracking Domain</dt>
                        <dd>{offer.trackingDomainHostname ?? "Unavailable"}</dd>
                      </div>
                      <div>
                        <dt>Payout</dt>
                        <dd>{formatPayout(offer)}</dd>
                      </div>
                      <div>
                        <dt>Schedule</dt>
                        <dd>{formatSchedule(offer)}</dd>
                      </div>
                      <div>
                        <dt>Expires</dt>
                        <dd>
                          {offer.expiresAt === null
                            ? "No expiry"
                            : formatUpdatedAt(offer.expiresAt)}
                        </dd>
                      </div>
                      <div>
                        <dt>Updated</dt>
                        <dd>{formatUpdatedAt(offer.updatedAt)}</dd>
                      </div>
                    </dl>

                    <div className="publisher-offer-card__actions">
                      <Link
                        className="control-secondary-button"
                        to="/reports/offers"
                      >
                        <MaterialIcon name="analytics" />
                        View Performance
                      </Link>
                    </div>
                  </div>
                </details>
              </GlassPanel>
            );
          })}
        </section>
      )}
    </div>
  );
}
