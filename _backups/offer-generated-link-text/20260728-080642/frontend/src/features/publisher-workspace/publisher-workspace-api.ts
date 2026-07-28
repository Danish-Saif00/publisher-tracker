import {
  authenticatedApiRequest,
  isRecord,
  readNullableString,
  readRequiredNumber,
  readRequiredString,
} from "../../lib/api-client";
import type {
  PublisherOffer,
  PublisherOfferDevice,
} from "./publisher-workspace.types";

function readStringArray(value: unknown, fieldName: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`The API returned an invalid ${fieldName}.`);
  }

  return Object.freeze([...(value as string[])]);
}

function readDevices(value: unknown): readonly PublisherOfferDevice[] {
  const devices = readStringArray(value, "Publisher Offer devices");

  if (
    devices.some(
      (device) =>
        device !== "desktop" && device !== "android" && device !== "ios",
    )
  ) {
    throw new Error("The API returned an unsupported Publisher Offer device.");
  }

  return Object.freeze([...devices] as PublisherOfferDevice[]);
}

function parsePublisherOffer(value: unknown): PublisherOffer {
  if (!isRecord(value)) {
    throw new Error("The API returned an invalid Publisher Offer.");
  }

  return Object.freeze({
    id: readRequiredString(value.id, "Publisher Offer id"),
    publicId: readRequiredNumber(value.publicId, "Publisher Offer public id"),
    name: readRequiredString(value.name, "Publisher Offer name"),
    countries: readStringArray(value.countries, "Publisher Offer countries"),
    devices: readDevices(value.devices),
    trackingDomainId: readNullableString(
      value.trackingDomainId,
      "Publisher Offer tracking Domain id",
    ),
    trackingDomainHostname: readNullableString(
      value.trackingDomainHostname,
      "Publisher Offer tracking Domain hostname",
    ),
    updatedAt: readRequiredString(
      value.updatedAt,
      "Publisher Offer updated time",
    ),
  });
}

export async function fetchPublisherOffers(
  accessToken: string,
  companyId: string,
  signal?: AbortSignal,
): Promise<readonly PublisherOffer[]> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${encodeURIComponent(companyId)}/catalog/publisher-offers`,
    {
      companyId,
      ...(signal !== undefined ? { signal } : {}),
    },
  );

  if (
    !isRecord(payload) ||
    !isRecord(payload.data) ||
    !Array.isArray(payload.data.offers)
  ) {
    throw new Error("The API returned an invalid Publisher Offer directory.");
  }

  return Object.freeze(payload.data.offers.map(parsePublisherOffer));
}
