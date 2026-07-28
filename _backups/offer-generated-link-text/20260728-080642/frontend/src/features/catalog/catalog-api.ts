import {
  authenticatedApiRequest,
  isRecord,
  readNullableString,
  readRequiredNumber,
  readRequiredString,
} from "../../lib/api-client";
import type {
  CatalogDevice,
  CatalogDomain,
  CatalogManager,
  CatalogNetwork,
  CatalogNetworkStatus,
  CatalogOffer,
  CatalogOfferStatus,
  CatalogPayoutType,
  CatalogProvider,
  CatalogPublisher,
  CatalogRedirectType,
  CatalogReferrerMode,
  CoreCatalogSnapshot,
  CreateCatalogNetworkInput,
  CreateCatalogOfferInput,
  UpdateCatalogNetworkInput,
  UpdateCatalogOfferInput,
  UpdateCatalogPublisherInput,
} from "./catalog.types";

function readData(payload: unknown): unknown {
  if (!isRecord(payload)) {
    throw new Error("The API returned an invalid response envelope.");
  }

  return payload.data;
}

function readArray(value: unknown, fieldName: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`The API returned an invalid ${fieldName}.`);
  }

  return value;
}

function readBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`The API returned an invalid ${fieldName}.`);
  }

  return value;
}

function readNullableNumber(value: unknown, fieldName: string): number | null {
  return value === null ? null : readRequiredNumber(value, fieldName);
}

function readStringArray(value: unknown, fieldName: string): readonly string[] {
  return readArray(value, fieldName).map((item) =>
    readRequiredString(item, fieldName),
  );
}

function readNumberArray(value: unknown, fieldName: string): readonly number[] {
  return readArray(value, fieldName).map((item) =>
    readRequiredNumber(item, fieldName),
  );
}

function readStatus<T extends string>(
  value: unknown,
  fieldName: string,
  allowed: readonly T[],
): T {
  const status = readRequiredString(value, fieldName);

  if (!allowed.includes(status as T)) {
    throw new Error(`The API returned an unsupported ${fieldName}.`);
  }

  return status as T;
}

function parseProvider(value: unknown): CatalogProvider {
  if (!isRecord(value)) {
    throw new Error("The API returned an invalid provider.");
  }

  return {
    id: readRequiredString(value.id, "provider id"),
    code: readRequiredString(value.code, "provider code"),
    name: readRequiredString(value.name, "provider name"),
    status: readStatus(value.status, "provider status", ["active", "archived"]),
  };
}

function parseDomain(value: unknown): CatalogDomain {
  if (!isRecord(value)) {
    throw new Error("The API returned an invalid domain.");
  }

  return {
    id: readRequiredString(value.id, "domain id"),
    hostname: readRequiredString(value.hostname, "domain hostname"),
    status: readStatus(value.status, "domain status", [
      "pending_verification",
      "active",
      "suspended",
      "archived",
    ]),
    isPrimary: readBoolean(value.isPrimary, "primary-domain flag"),
    verifiedAt: readNullableString(
      value.verifiedAt,
      "domain verification time",
    ),
    offerCount: readRequiredNumber(value.offerCount, "domain offer count"),
    createdAt: readRequiredString(value.createdAt, "domain creation time"),
    updatedAt: readRequiredString(value.updatedAt, "domain update time"),
  };
}

function parseNetwork(value: unknown): CatalogNetwork {
  if (!isRecord(value)) {
    throw new Error("The API returned an invalid network.");
  }

  return {
    id: readRequiredString(value.id, "network id"),
    companyId: readRequiredString(value.companyId, "network company id"),
    providerId: readRequiredString(value.providerId, "network provider id"),
    providerCode: readRequiredString(
      value.providerCode,
      "network provider code",
    ),
    providerName: readRequiredString(
      value.providerName,
      "network provider name",
    ),
    name: readRequiredString(value.name, "network name"),
    externalAccountId: readNullableString(
      value.externalAccountId,
      "external account id",
    ),
    status: readStatus<CatalogNetworkStatus>(value.status, "network status", [
      "active",
      "suspended",
      "archived",
    ]),
    trackingParameter: readNullableString(
      value.trackingParameter,
      "tracking parameter",
    ),
    postbackUrl: readNullableString(value.postbackUrl, "postback URL"),
    duplicateAllowed: readBoolean(
      value.duplicateAllowed,
      "network duplicate flag",
    ),
    offerCount: readRequiredNumber(value.offerCount, "network offer count"),
    createdAt: readRequiredString(value.createdAt, "network creation time"),
    updatedAt: readRequiredString(value.updatedAt, "network update time"),
  };
}

function parseOffer(value: unknown): CatalogOffer {
  if (!isRecord(value)) {
    throw new Error("The API returned an invalid offer.");
  }

  const devices = readStringArray(value.devices, "offer devices").map((item) =>
    readStatus<CatalogDevice>(item, "offer device", [
      "desktop",
      "android",
      "ios",
    ]),
  );

  return {
    id: readRequiredString(value.id, "offer id"),
    publicId: readRequiredNumber(value.publicId, "offer public id"),
    companyId: readRequiredString(value.companyId, "offer company id"),
    networkAccountId: readRequiredString(
      value.networkAccountId,
      "offer network id",
    ),
    networkAccountName: readRequiredString(
      value.networkAccountName,
      "offer network name",
    ),
    providerId: readRequiredString(value.providerId, "offer provider id"),
    providerCode: readRequiredString(value.providerCode, "offer provider code"),
    providerName: readRequiredString(value.providerName, "offer provider name"),
    trackingDomainId: readNullableString(
      value.trackingDomainId,
      "offer domain id",
    ),
    trackingDomainHostname: readNullableString(
      value.trackingDomainHostname,
      "offer domain hostname",
    ),
    code: readRequiredString(value.code, "offer code"),
    externalOfferId: readNullableString(
      value.externalOfferId,
      "external offer id",
    ),
    name: readRequiredString(value.name, "offer name"),
    description: readNullableString(value.description, "offer description"),
    destinationUrl: readRequiredString(
      value.destinationUrl,
      "offer destination URL",
    ),
    status: readStatus<CatalogOfferStatus>(value.status, "offer status", [
      "draft",
      "active",
      "paused",
      "archived",
    ]),
    countries: readStringArray(value.countries, "offer countries"),
    devices,
    desktopUrl: readNullableString(value.desktopUrl, "desktop URL"),
    androidUrl: readNullableString(value.androidUrl, "Android URL"),
    iosUrl: readNullableString(value.iosUrl, "iOS URL"),
    redirectType: readStatus<CatalogRedirectType>(
      value.redirectType,
      "redirect type",
      ["301", "302"],
    ),
    referrerMode: readStatus<CatalogReferrerMode>(
      value.referrerMode,
      "referrer mode",
      ["preserve", "strip"],
    ),
    defaultPayoutAmountMinor: readNullableNumber(
      value.defaultPayoutAmountMinor,
      "default payout",
    ),
    payoutCurrency: readNullableString(value.payoutCurrency, "payout currency"),
    timezone: readRequiredString(value.timezone, "offer timezone"),
    activeDays: readNumberArray(value.activeDays, "offer active days"),
    activeStartTime: readNullableString(
      value.activeStartTime,
      "offer start time",
    ),
    activeEndTime: readNullableString(value.activeEndTime, "offer end time"),
    proxyEnabled: readBoolean(value.proxyEnabled, "offer proxy flag"),
    expiresAt: readNullableString(value.expiresAt, "offer expiry"),
    duplicateAllowed: readBoolean(
      value.duplicateAllowed,
      "offer duplicate flag",
    ),
    managerMembershipIds: readStringArray(
      value.managerMembershipIds,
      "offer manager ids",
    ),
    publisherMembershipIds: readStringArray(
      value.publisherMembershipIds,
      "offer publisher ids",
    ),
    clicks: readRequiredNumber(value.clicks, "offer click count"),
    conversions: readRequiredNumber(
      value.conversions,
      "offer conversion count",
    ),
    createdAt: readRequiredString(value.createdAt, "offer creation time"),
    updatedAt: readRequiredString(value.updatedAt, "offer update time"),
  };
}

function parseManager(value: unknown): CatalogManager {
  if (!isRecord(value)) {
    throw new Error("The API returned an invalid Manager.");
  }

  return {
    membershipId: readRequiredString(
      value.membershipId,
      "Manager membership id",
    ),
    publicId: readRequiredNumber(value.publicId, "Manager public id"),
    companyId: readRequiredString(value.companyId, "Manager company id"),
    userId: readRequiredString(value.userId, "Manager user id"),
    email: readNullableString(value.email, "Manager email"),
    displayName: readNullableString(value.displayName, "Manager name"),
    userStatus: readStatus(value.userStatus, "Manager user status", [
      "active",
      "suspended",
    ]),
    membershipStatus: readStatus(
      value.membershipStatus,
      "Manager membership status",
      ["invited", "active", "suspended", "revoked"],
    ),
    offerCount: readRequiredNumber(value.offerCount, "Manager offer count"),
    joinedAt: readNullableString(value.joinedAt, "Manager joined time"),
    createdAt: readRequiredString(value.createdAt, "Manager creation time"),
    updatedAt: readRequiredString(value.updatedAt, "Manager update time"),
  };
}

function parsePublisher(value: unknown): CatalogPublisher {
  if (!isRecord(value)) {
    throw new Error("The API returned an invalid publisher.");
  }

  return {
    membershipId: readRequiredString(
      value.membershipId,
      "publisher membership id",
    ),
    publicId: readRequiredNumber(value.publicId, "publisher public id"),
    companyId: readRequiredString(value.companyId, "publisher company id"),
    userId: readRequiredString(value.userId, "publisher user id"),
    email: readNullableString(value.email, "publisher email"),
    displayName: readNullableString(value.displayName, "publisher name"),
    userStatus: readStatus(value.userStatus, "publisher user status", [
      "active",
      "suspended",
    ]),
    membershipStatus: readStatus(
      value.membershipStatus,
      "publisher membership status",
      ["invited", "active", "suspended", "revoked"],
    ),
    invitedBy: readNullableString(value.invitedBy, "publisher inviter"),
    timezone: readRequiredString(value.timezone, "publisher timezone"),
    payoutType: readStatus<CatalogPayoutType>(
      value.payoutType,
      "publisher payout type",
      ["fixed_member", "per_offer"],
    ),
    fixedPayoutAmountMinor: readNullableNumber(
      value.fixedPayoutAmountMinor,
      "publisher fixed payout",
    ),
    payoutCurrency: readNullableString(
      value.payoutCurrency,
      "publisher payout currency",
    ),
    postbackUrl: readNullableString(
      value.postbackUrl,
      "publisher postback URL",
    ),
    emailNotificationsEnabled: readBoolean(
      value.emailNotificationsEnabled,
      "publisher email flag",
    ),
    offerCount: readRequiredNumber(value.offerCount, "publisher offer count"),
    assignedOfferIds: readStringArray(
      value.assignedOfferIds,
      "publisher Offer assignments",
    ),
    managerMembershipIds: readStringArray(
      value.managerMembershipIds,
      "publisher Manager assignments",
    ),
    joinedAt: readNullableString(value.joinedAt, "publisher joined time"),
    createdAt: readRequiredString(value.createdAt, "publisher creation time"),
    updatedAt: readRequiredString(value.updatedAt, "publisher update time"),
  };
}

function parseSnapshot(value: unknown): CoreCatalogSnapshot {
  if (!isRecord(value) || !isRecord(value.summary)) {
    throw new Error("The API returned an invalid catalog snapshot.");
  }

  return {
    companyId: readRequiredString(value.companyId, "catalog company id"),
    summary: {
      domains: readRequiredNumber(value.summary.domains, "domain count"),
      networks: readRequiredNumber(value.summary.networks, "network count"),
      offers: readRequiredNumber(value.summary.offers, "offer count"),
      managers:
        value.summary.managers === undefined
          ? readArray(value.managers, "Managers").length
          : readRequiredNumber(value.summary.managers, "Manager count"),
      publishers: readRequiredNumber(
        value.summary.publishers,
        "publisher count",
      ),
    },
    providers: readArray(value.providers, "providers").map(parseProvider),
    domains: readArray(value.domains, "domains").map(parseDomain),
    networks: readArray(value.networks, "networks").map(parseNetwork),
    offers: readArray(value.offers, "offers").map(parseOffer),
    managers: readArray(value.managers, "Managers").map(parseManager),
    publishers: readArray(value.publishers, "publishers").map(parsePublisher),
  };
}

export async function fetchCoreCatalog(
  accessToken: string,
  companyId: string,
  signal?: AbortSignal,
): Promise<CoreCatalogSnapshot> {
  const payload = await authenticatedApiRequest(
    accessToken,
    `/companies/${encodeURIComponent(companyId)}/catalog`,
    { companyId, ...(signal !== undefined ? { signal } : {}) },
  );

  return parseSnapshot(readData(payload));
}

async function writeCatalogEntity<T>(
  accessToken: string,
  companyId: string,
  path: string,
  method: "POST" | "PUT",
  body: unknown,
  parser: (value: unknown) => T,
): Promise<T> {
  const payload = await authenticatedApiRequest(accessToken, path, {
    companyId,
    method,
    body,
  });

  return parser(readData(payload));
}

export function createCatalogOffer(
  accessToken: string,
  companyId: string,
  input: CreateCatalogOfferInput,
): Promise<CatalogOffer> {
  return writeCatalogEntity(
    accessToken,
    companyId,
    `/companies/${encodeURIComponent(companyId)}/catalog/offers`,
    "POST",
    input,
    parseOffer,
  );
}

export function updateCatalogOffer(
  accessToken: string,
  companyId: string,
  input: UpdateCatalogOfferInput,
): Promise<CatalogOffer> {
  const { offerId, ...body } = input;
  return writeCatalogEntity(
    accessToken,
    companyId,
    `/companies/${encodeURIComponent(companyId)}/catalog/offers/${encodeURIComponent(offerId)}`,
    "PUT",
    body,
    parseOffer,
  );
}

export function createCatalogNetwork(
  accessToken: string,
  companyId: string,
  input: CreateCatalogNetworkInput,
): Promise<CatalogNetwork> {
  return writeCatalogEntity(
    accessToken,
    companyId,
    `/companies/${encodeURIComponent(companyId)}/catalog/networks`,
    "POST",
    input,
    parseNetwork,
  );
}

export function updateCatalogNetwork(
  accessToken: string,
  companyId: string,
  input: UpdateCatalogNetworkInput,
): Promise<CatalogNetwork> {
  const { accountId, ...body } = input;
  return writeCatalogEntity(
    accessToken,
    companyId,
    `/companies/${encodeURIComponent(companyId)}/catalog/networks/${encodeURIComponent(accountId)}`,
    "PUT",
    body,
    parseNetwork,
  );
}

export function updateCatalogPublisher(
  accessToken: string,
  companyId: string,
  input: UpdateCatalogPublisherInput,
): Promise<CatalogPublisher> {
  const { membershipId, ...body } = input;
  return writeCatalogEntity(
    accessToken,
    companyId,
    `/companies/${encodeURIComponent(companyId)}/catalog/publishers/${encodeURIComponent(membershipId)}`,
    "PUT",
    body,
    parsePublisher,
  );
}
