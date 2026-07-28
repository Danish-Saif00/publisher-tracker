/**
 * Publisher-safe Offer projection returned by the assigned Offer directory.
 *
 * Sensitive network configuration, destination URLs, payout rules, and internal
 * assignment metadata are intentionally excluded from this client contract.
 */
export type PublisherOfferDevice = "desktop" | "android" | "ios";

export type PublisherOffer = {
  id: string;
  publicId: number;
  name: string;
  countries: readonly string[];
  devices: readonly PublisherOfferDevice[];
  trackingDomainId: string | null;
  trackingDomainHostname: string | null;
  updatedAt: string;
};

export type PublisherWorkspaceLoadStatus =
  "idle" | "loading" | "ready" | "error" | "forbidden";
