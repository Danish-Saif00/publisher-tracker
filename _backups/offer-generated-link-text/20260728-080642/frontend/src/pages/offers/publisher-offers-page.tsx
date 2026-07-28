import { useMemo, useState } from "react";
import { Link } from "react-router";

import { MaterialIcon } from "../../components/icons/material-icon";
import { GlassPanel } from "../../components/ui/glass-panel";
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

function formatCountries(countries: readonly string[]): string {
  return countries.length === 0 ? "Worldwide" : countries.join(", ");
}

function formatDevices(devices: readonly string[]): string {
  return devices
    .map((device) =>
      device === "ios" ? "iOS" : device === "android" ? "Android" : "Desktop",
    )
    .join(", ");
}

export function PublisherOffersPage() {
  const publisherOffers = usePublisherOffers();
  const [search, setSearch] = useState("");

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
            Only active Offers assigned to your Publisher membership are shown.
            Internal network, destination, payout-rule, and assignment details
            remain hidden.
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

      <ControlFeedback error={publisherOffers.error} message={null} />

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
          {filteredOffers.map((offer) => (
            <GlassPanel
              as="article"
              className="publisher-offer-card"
              key={offer.id}
            >
              <div className="publisher-offer-card__heading">
                <div>
                  <span>Offer #{offer.publicId}</span>
                  <h2>{offer.name}</h2>
                </div>
                <MaterialIcon name="local_offer" />
              </div>

              <dl className="publisher-offer-card__details">
                <div>
                  <dt>Countries</dt>
                  <dd>{formatCountries(offer.countries)}</dd>
                </div>
                <div>
                  <dt>Devices</dt>
                  <dd>{formatDevices(offer.devices)}</dd>
                </div>
                <div>
                  <dt>Tracking Domain</dt>
                  <dd>
                    {offer.trackingDomainHostname ??
                      "Assigned at link creation"}
                  </dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{formatUpdatedAt(offer.updatedAt)}</dd>
                </div>
              </dl>

              <div className="publisher-offer-card__actions">
                <Link
                  className="primary-gradient-button primary-gradient-button--compact"
                  to="/tracking-links"
                >
                  <MaterialIcon name="link" />
                  Open Tracking Links
                </Link>
                <Link className="control-secondary-button" to="/reports/offers">
                  <MaterialIcon name="analytics" />
                  View Performance
                </Link>
              </div>
            </GlassPanel>
          ))}
        </section>
      )}
    </div>
  );
}
