import { createDecipheriv } from 'node:crypto';
import { isIP } from 'node:net';
import type { DatabaseRuntime } from '@affiliate-tracker/database';
import { serializeError, type ObservabilityLogger } from '@affiliate-tracker/observability';
const ENCRYPTION_KEY_LENGTH_BYTES = 32;
const ENCRYPTION_IV_LENGTH_BYTES = 12;
const ENCRYPTION_AUTH_TAG_LENGTH_BYTES = 16;
export type ProxyDetectionOutcome =
  'not_checked' | 'bypassed' | 'clean' | 'flagged' | 'blocked' | 'provider_failed';
type ProxyProviderCode = 'ipqualityscore' | 'proxycheck';
type ProxyEnforcementMode = 'monitor' | 'enforce';
type ProxyFailureBehavior = 'allow' | 'flag' | 'block';
interface ProxyDetectionRequest {
  readonly trackingClickId: string;
  readonly companyId: string;
  readonly ownerMembershipId: string;
  readonly ipAddress: string;
  readonly ipHash: string;
  readonly userAgent: string | null;
}
export interface ProxyDetectionDecision {
  readonly outcome: ProxyDetectionOutcome;
  readonly blocked: boolean;
  readonly countryCode: string | null;
  readonly countryName: string | null;
}
export interface ProxyDetectionService {
  evaluate(input: ProxyDetectionRequest): Promise<ProxyDetectionDecision>;
}
interface ProxyDetectionRuntimeOptions {
  readonly database: DatabaseRuntime;
  readonly encryptionKey: string;
  readonly logger: ObservabilityLogger;
}
interface CompanyProxyConfiguration {
  readonly companyId: string;
  readonly providerCode: ProxyProviderCode;
  readonly encryptedApiKey: string;
  readonly apiKeyIv: string;
  readonly apiKeyAuthTag: string;
  readonly enforcementMode: ProxyEnforcementMode;
  readonly riskThreshold: number;
  readonly requestTimeoutMs: number;
  readonly cacheTtlSeconds: number;
  readonly failureBehavior: ProxyFailureBehavior;
  readonly detectProxy: boolean;
  readonly detectVpn: boolean;
  readonly detectTor: boolean;
  readonly bypassOwnerMembershipIds: readonly string[];
}
interface ProviderDetection {
  readonly riskScore: number;
  readonly isProxy: boolean;
  readonly isVpn: boolean;
  readonly isTor: boolean;
  readonly providerSnapshot: Readonly<Record<string, unknown>>;
}
interface CachedProviderDetection extends ProviderDetection {
  readonly checkedAt: string;
  readonly expiresAt: string;
}
interface ProviderLookupInput {
  readonly providerCode: ProxyProviderCode;
  readonly apiKey: string;
  readonly ipAddress: string;
  readonly userAgent: string | null;
  readonly timeoutMs: number;
}
interface ApplyProxyDecisionInput {
  readonly trackingClickId: string;
  readonly companyId: string;
  readonly outcome: ProxyDetectionOutcome;
  readonly providerCode: ProxyProviderCode | null;
  readonly riskScore: number | null;
  readonly isProxy: boolean | null;
  readonly isVpn: boolean | null;
  readonly isTor: boolean | null;
  readonly failureCode: string | null;
  readonly snapshot: Readonly<Record<string, unknown>>;
  readonly checkedAt: string | null;
  readonly blockAttribution: boolean;
}
type ConfigurationRow = Readonly<{
  company_id: string;
  provider_code: string;
  encrypted_api_key: string;
  api_key_iv: string;
  api_key_auth_tag: string;
  enforcement_mode: string;
  risk_threshold: number;
  request_timeout_ms: number;
  cache_ttl_seconds: number;
  failure_behavior: string;
  detect_proxy: boolean;
  detect_vpn: boolean;
  detect_tor: boolean;
  bypass_owner_membership_ids: string[];
}> &
  Record<string, unknown>;
type CacheRow = Readonly<{
  risk_score: number | null;
  is_proxy: boolean | null;
  is_vpn: boolean | null;
  is_tor: boolean | null;
  provider_snapshot: unknown;
  checked_at: string | Date;
  expires_at: string | Date;
}> &
  Record<string, unknown>;
class ProxyProviderLookupError extends Error {
  public readonly code: string;
  public constructor(code: string, message: string) {
    super(message);
    this.name = 'ProxyProviderLookupError';
    this.code = code;
  }
}
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function normalizeTimestamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('The database returned an invalid Proxy timestamp.');
  }
  return date.toISOString();
}
function normalizeSnapshot(value: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(value)) {
    throw new Error('The database returned an invalid Proxy provider snapshot.');
  }
  return Object.freeze({
    ...value,
  });
}
function parseProviderCode(value: string): ProxyProviderCode {
  if (value === 'ipqualityscore' || value === 'proxycheck') {
    return value;
  }
  throw new Error('The database returned an unsupported Proxy provider.');
}
function parseEnforcementMode(value: string): ProxyEnforcementMode {
  if (value === 'monitor' || value === 'enforce') {
    return value;
  }
  throw new Error('The database returned an unsupported Proxy enforcement mode.');
}
function parseFailureBehavior(value: string): ProxyFailureBehavior {
  if (value === 'allow' || value === 'flag' || value === 'block') {
    return value;
  }
  throw new Error('The database returned an unsupported Proxy failure policy.');
}
function mapConfiguration(row: ConfigurationRow): CompanyProxyConfiguration {
  return Object.freeze({
    companyId: row.company_id,
    providerCode: parseProviderCode(row.provider_code),
    encryptedApiKey: row.encrypted_api_key,
    apiKeyIv: row.api_key_iv,
    apiKeyAuthTag: row.api_key_auth_tag,
    enforcementMode: parseEnforcementMode(row.enforcement_mode),
    riskThreshold: row.risk_threshold,
    requestTimeoutMs: row.request_timeout_ms,
    cacheTtlSeconds: row.cache_ttl_seconds,
    failureBehavior: parseFailureBehavior(row.failure_behavior),
    detectProxy: row.detect_proxy,
    detectVpn: row.detect_vpn,
    detectTor: row.detect_tor,
    bypassOwnerMembershipIds: Object.freeze([...row.bypass_owner_membership_ids]),
  });
}
function mapCachedDetection(row: CacheRow): CachedProviderDetection {
  if (
    row.risk_score === null ||
    row.is_proxy === null ||
    row.is_vpn === null ||
    row.is_tor === null
  ) {
    throw new Error('The Proxy cache returned an incomplete detection result.');
  }
  return Object.freeze({
    riskScore: row.risk_score,
    isProxy: row.is_proxy,
    isVpn: row.is_vpn,
    isTor: row.is_tor,
    providerSnapshot: normalizeSnapshot(row.provider_snapshot),
    checkedAt: normalizeTimestamp(row.checked_at),
    expiresAt: normalizeTimestamp(row.expires_at),
  });
}
function decodeEncryptionKey(value: string): Buffer {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error('DATA_ENCRYPTION_KEY is required by the tracker.');
  }
  const key = Buffer.from(normalized, 'base64');
  const normalizedBase64 = normalized.replace(/=+$/u, '');
  const decodedBase64 = key.toString('base64').replace(/=+$/u, '');
  if (key.length !== ENCRYPTION_KEY_LENGTH_BYTES || decodedBase64 !== normalizedBase64) {
    throw new Error('DATA_ENCRYPTION_KEY must be a Base64-encoded 32-byte key.');
  }
  return key;
}
function decodeBase64(value: string, fieldName: string): Buffer {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(fieldName + ' is empty.');
  }
  const decoded = Buffer.from(normalized, 'base64');
  if (decoded.length === 0) {
    throw new Error(fieldName + ' is invalid.');
  }
  return decoded;
}
function createCredentialDecryptor(encryptionKey: string) {
  const key = decodeEncryptionKey(encryptionKey);
  return Object.freeze({
    decrypt(encryptedApiKey: string, apiKeyIv: string, apiKeyAuthTag: string): string {
      const ciphertext = decodeBase64(encryptedApiKey, 'Proxy API-key ciphertext');
      const iv = decodeBase64(apiKeyIv, 'Proxy API-key IV');
      const authTag = decodeBase64(apiKeyAuthTag, 'Proxy API-key authentication tag');
      if (
        iv.length !== ENCRYPTION_IV_LENGTH_BYTES ||
        authTag.length !== ENCRYPTION_AUTH_TAG_LENGTH_BYTES
      ) {
        throw new Error('Stored Proxy credential encryption metadata is invalid.');
      }
      const decipher = createDecipheriv('aes-256-gcm', key, iv, {
        authTagLength: ENCRYPTION_AUTH_TAG_LENGTH_BYTES,
      });
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    },
  });
}
function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}
function readString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}
function readRiskScore(value: unknown): number | undefined {
  let candidate: number;
  if (typeof value === 'number') {
    candidate = value;
  } else if (typeof value === 'string') {
    candidate = Number(value.trim().replace(/%$/u, ''));
  } else {
    return undefined;
  }
  if (!Number.isFinite(candidate)) {
    return undefined;
  }
  return Math.max(0, Math.min(100, Math.round(candidate)));
}
function readIpqsProxySignal(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'string') {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'none' || normalized === 'no' || normalized === 'false') {
    return false;
  }
  return (
    normalized === 'low' ||
    normalized === 'medium' ||
    normalized === 'high' ||
    normalized === 'yes' ||
    normalized === 'true'
  );
}
async function fetchProviderJson(url: URL, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  timeout.unref();
  try {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          accept: 'application/json',
        },
        signal: controller.signal,
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ProxyProviderLookupError(
          'PROXY_PROVIDER_TIMEOUT',
          'The Proxy provider request timed out.',
        );
      }
      throw new ProxyProviderLookupError(
        'PROXY_PROVIDER_REQUEST_FAILED',
        'The Proxy provider request failed.',
      );
    }
    if (!response.ok) {
      throw new ProxyProviderLookupError(
        'PROXY_PROVIDER_HTTP_ERROR',
        'The Proxy provider returned an unsuccessful HTTP status.',
      );
    }
    try {
      return await response.json();
    } catch {
      throw new ProxyProviderLookupError(
        'PROXY_PROVIDER_RESPONSE_INVALID',
        'The Proxy provider returned invalid JSON.',
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}
async function lookupIpQualityScore(input: ProviderLookupInput): Promise<ProviderDetection> {
  const url = new URL(
    'https://www.ipqualityscore.com/api/json/ip/' +
      encodeURIComponent(input.apiKey) +
      '/' +
      encodeURIComponent(input.ipAddress),
  );
  url.searchParams.set('strictness', '1');
  url.searchParams.set('allow_public_access_points', 'true');
  if (input.userAgent !== null) {
    url.searchParams.set('user_agent', input.userAgent);
  }
  const payload = await fetchProviderJson(url, input.timeoutMs);
  if (!isRecord(payload)) {
    throw new ProxyProviderLookupError(
      'PROXY_PROVIDER_RESPONSE_INVALID',
      'IPQualityScore returned an invalid response.',
    );
  }
  if (readBoolean(payload['success']) !== true) {
    throw new ProxyProviderLookupError(
      'PROXY_PROVIDER_REJECTED',
      'IPQualityScore rejected the lookup.',
    );
  }
  const isProxy = readIpqsProxySignal(payload['proxy']);
  const isVpn = readBoolean(payload['vpn']) ?? false;
  const isTor = readBoolean(payload['tor']) ?? false;
  const fallbackRisk = isProxy ? 100 : isTor ? 75 : isVpn ? 50 : 0;
  const riskScore = readRiskScore(payload['fraud_score']) ?? fallbackRisk;
  return Object.freeze({
    riskScore,
    isProxy,
    isVpn,
    isTor,
    providerSnapshot: Object.freeze({
      countryCode: readProviderCountryIdentity(payload).countryCode,
      countryName: readProviderCountryIdentity(payload).countryName,
      requestId: readString(payload['request_id']) ?? null,
      proxy: isProxy,
      vpn: isVpn,
      tor: isTor,
      riskScore,
    }),
  });
}
function findProxyCheckResult(
  payload: Readonly<Record<string, unknown>>,
  ipAddress: string,
): Readonly<Record<string, unknown>> {
  const direct = payload[ipAddress];
  if (isRecord(direct)) {
    return direct;
  }
  const returnedIp = readString(payload['ip']);
  if (returnedIp !== undefined) {
    const returnedResult = payload[returnedIp];
    if (isRecord(returnedResult)) {
      return returnedResult;
    }
  }
  throw new ProxyProviderLookupError(
    'PROXY_PROVIDER_RESPONSE_INVALID',
    'ProxyCheck returned no result for the requested address.',
  );
}
async function lookupProxyCheck(input: ProviderLookupInput): Promise<ProviderDetection> {
  const url = new URL('https://proxycheck.io/v3/' + encodeURIComponent(input.ipAddress));
  url.searchParams.set('key', input.apiKey);
  const payload = await fetchProviderJson(url, input.timeoutMs);
  if (!isRecord(payload)) {
    throw new ProxyProviderLookupError(
      'PROXY_PROVIDER_RESPONSE_INVALID',
      'ProxyCheck returned an invalid response.',
    );
  }
  const status = readString(payload['status'])?.toLowerCase();
  if (status !== 'ok' && status !== 'warning') {
    throw new ProxyProviderLookupError(
      'PROXY_PROVIDER_REJECTED',
      'ProxyCheck rejected the lookup.',
    );
  }
  const result = findProxyCheckResult(payload, input.ipAddress);
  const detectionsValue = result['detections'];
  if (!isRecord(detectionsValue)) {
    throw new ProxyProviderLookupError(
      'PROXY_PROVIDER_RESPONSE_INVALID',
      'ProxyCheck returned invalid detection data.',
    );
  }
  const anonymous = readBoolean(detectionsValue['anonymous']) ?? false;
  const isProxy = readBoolean(detectionsValue['proxy']) ?? anonymous;
  const isVpn = readBoolean(detectionsValue['vpn']) ?? false;
  const isTor = readBoolean(detectionsValue['tor']) ?? false;
  const fallbackRisk = isProxy ? 100 : isTor ? 75 : isVpn ? 50 : anonymous ? 50 : 0;
  const riskScore =
    readRiskScore(detectionsValue['risk_score']) ??
    readRiskScore(detectionsValue['risk']) ??
    readRiskScore(result['risk_score']) ??
    readRiskScore(result['risk']) ??
    fallbackRisk;
  const confidence = readRiskScore(detectionsValue['confidence']);
  return Object.freeze({
    riskScore,
    isProxy,
    isVpn,
    isTor,
    providerSnapshot: Object.freeze({
      countryCode: readProviderCountryIdentity(result).countryCode,
      countryName: readProviderCountryIdentity(result).countryName,
      anonymous,
      proxy: isProxy,
      vpn: isVpn,
      tor: isTor,
      riskScore,
      confidence: confidence ?? null,
    }),
  });
}
function readProviderCountryIdentity(value: Readonly<Record<string, unknown>>): Readonly<{
  countryCode: string | null;
  countryName: string | null;
}> {
  const locationValue = value['location'];
  const location = isRecord(locationValue) ? locationValue : undefined;

  const rawCode =
    readString(value['countryCode']) ??
    readString(value['country_code']) ??
    (location === undefined
      ? undefined
      : (readString(location['countryCode']) ??
        readString(location['country_code']) ??
        readString(location['iso_code'])));

  const rawName =
    readString(value['countryName']) ??
    readString(value['country']) ??
    (location === undefined
      ? undefined
      : (readString(location['countryName']) ??
        readString(location['country_name']) ??
        readString(location['country'])));

  return Object.freeze({
    countryCode:
      rawCode === undefined || rawCode.trim().length === 0 ? null : rawCode.trim().toUpperCase(),
    countryName: rawName === undefined || rawName.trim().length === 0 ? null : rawName.trim(),
  });
}

async function lookupProvider(input: ProviderLookupInput): Promise<ProviderDetection> {
  return input.providerCode === 'ipqualityscore'
    ? lookupIpQualityScore(input)
    : lookupProxyCheck(input);
}
function parseIpv4Octets(value: string): readonly number[] {
  return value.split('.').map((segment) => Number(segment));
}
function isPublicIpv4(value: string): boolean {
  const octets = parseIpv4Octets(value);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }
  const [first = 0, second = 0] = octets;
  if (first === 0 || first === 10 || first === 127 || first >= 224) {
    return false;
  }
  if (first === 100 && second >= 64 && second <= 127) {
    return false;
  }
  if (first === 169 && second === 254) {
    return false;
  }
  if (first === 172 && second >= 16 && second <= 31) {
    return false;
  }
  if (first === 192 && second === 168) {
    return false;
  }
  if (first === 192 && second === 0) {
    return false;
  }
  if (first === 192 && second === 0 && octets[2] === 2) {
    return false;
  }
  if (first === 198 && (second === 18 || second === 19 || second === 51)) {
    return false;
  }
  if (first === 203 && second === 0 && octets[2] === 113) {
    return false;
  }
  return true;
}
function isPublicIpv6(value: string): boolean {
  const normalized = value.toLowerCase();
  if (normalized === '::' || normalized === '::1' || normalized.startsWith('2001:db8:')) {
    return false;
  }
  const firstSegment = normalized.split(':')[0] ?? '';
  const firstValue = Number.parseInt(firstSegment.length === 0 ? '0' : firstSegment, 16);
  if (!Number.isFinite(firstValue)) {
    return false;
  }
  if ((firstValue & 0xfe00) === 0xfc00) {
    return false;
  }
  if ((firstValue & 0xffc0) === 0xfe80) {
    return false;
  }
  return true;
}
function isPublicIpAddress(value: string): boolean {
  const version = isIP(value);
  if (version === 4) {
    return isPublicIpv4(value);
  }
  if (version === 6) {
    return isPublicIpv6(value);
  }
  return false;
}
async function getActiveConfiguration(
  database: DatabaseRuntime,
  companyId: string,
): Promise<CompanyProxyConfiguration | undefined> {
  return database.transaction(async (transaction) => {
    const result = await transaction.query<ConfigurationRow>({
      name: 'tracker-get-active-proxy-configuration',
      text: `
            select
              company_id,
              provider_code,
              encrypted_api_key,
              api_key_iv,
              api_key_auth_tag,
              enforcement_mode,
              risk_threshold,
              request_timeout_ms,
              cache_ttl_seconds,
              failure_behavior,
              detect_proxy,
              detect_vpn,
              detect_tor,
              bypass_owner_membership_ids
            from public.company_proxy_configurations
            where company_id = $1
              and status = 'active'
            limit 1
          `,
      values: [companyId],
    });
    const row = result.rows[0];
    return row === undefined ? undefined : mapConfiguration(row);
  });
}
async function getCachedDetection(
  database: DatabaseRuntime,
  companyId: string,
  providerCode: ProxyProviderCode,
  ipHash: string,
): Promise<CachedProviderDetection | undefined> {
  return database.transaction(async (transaction) => {
    const result = await transaction.query<CacheRow>({
      name: 'tracker-get-proxy-detection-cache',
      text: `
            select
              risk_score,
              is_proxy,
              is_vpn,
              is_tor,
              provider_snapshot,
              checked_at,
              expires_at
            from public.proxy_detection_cache
            where company_id = $1
              and provider_code = $2
              and ip_hash = $3
              and expires_at > now()
            limit 1
          `,
      values: [companyId, providerCode, ipHash],
    });
    const row = result.rows[0];
    return row === undefined ? undefined : mapCachedDetection(row);
  });
}
async function upsertCachedDetection(
  database: DatabaseRuntime,
  configuration: CompanyProxyConfiguration,
  ipHash: string,
  detection: ProviderDetection,
  checkedAt: string,
): Promise<void> {
  const expiresAt = new Date(
    new Date(checkedAt).getTime() + configuration.cacheTtlSeconds * 1_000,
  ).toISOString();
  await database.transaction(async (transaction) => {
    await transaction.query({
      name: 'tracker-upsert-proxy-detection-cache',
      text: `
          insert into public.proxy_detection_cache (
            company_id,
            provider_code,
            ip_hash,
            risk_score,
            is_proxy,
            is_vpn,
            is_tor,
            provider_snapshot,
            checked_at,
            expires_at
          )
          values (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6,
            $7,
            $8::jsonb,
            $9::timestamptz,
            $10::timestamptz
          )
          on conflict (
            company_id,
            provider_code,
            ip_hash
          )
          do update set
            risk_score =
              excluded.risk_score,
            is_proxy =
              excluded.is_proxy,
            is_vpn =
              excluded.is_vpn,
            is_tor =
              excluded.is_tor,
            provider_snapshot =
              excluded.provider_snapshot,
            checked_at =
              excluded.checked_at,
            expires_at =
              excluded.expires_at
        `,
      values: [
        configuration.companyId,
        configuration.providerCode,
        ipHash,
        detection.riskScore,
        detection.isProxy,
        detection.isVpn,
        detection.isTor,
        JSON.stringify(detection.providerSnapshot),
        checkedAt,
        expiresAt,
      ],
    });
  });
}
async function applyProxyDecision(
  database: DatabaseRuntime,
  input: ApplyProxyDecisionInput,
): Promise<void> {
  await database.transaction(async (transaction) => {
    await transaction.query({
      name: 'tracker-apply-proxy-decision',
      text: `
          update public.tracking_clicks
          set
            proxy_detection_outcome =
              $3::public.proxy_detection_outcome,
            proxy_provider_code = $4,
            proxy_risk_score = $5,
            proxy_is_proxy = $6,
            proxy_is_vpn = $7,
            proxy_is_tor = $8,
            proxy_failure_code = $9,
            proxy_decision_snapshot =
              $10::jsonb,
            proxy_checked_at =
              $11::timestamptz,
            attribution_eligible =
              case
                when $12
                then false
                else attribution_eligible
              end
          where id = $1
            and company_id = $2
        `,
      values: [
        input.trackingClickId,
        input.companyId,
        input.outcome,
        input.providerCode,
        input.riskScore,
        input.isProxy,
        input.isVpn,
        input.isTor,
        input.failureCode,
        JSON.stringify(input.snapshot),
        input.checkedAt,
        input.blockAttribution,
      ],
    });
  });
}
function createDecision(
  outcome: ProxyDetectionOutcome,
  blocked: boolean,
  countryCode: string | null = null,
  countryName: string | null = null,
): ProxyDetectionDecision {
  return Object.freeze({
    outcome,
    blocked,
    countryCode,
    countryName,
  });
}
export function createProxyDetectionRuntime(
  options: ProxyDetectionRuntimeOptions,
): ProxyDetectionService {
  const decryptor = createCredentialDecryptor(options.encryptionKey);
  async function persistFailure(
    configuration: CompanyProxyConfiguration,
    input: ProxyDetectionRequest,
    error: unknown,
    failureCode: string,
  ): Promise<ProxyDetectionDecision> {
    const checkedAt = new Date().toISOString();
    const blocked =
      configuration.enforcementMode === 'enforce' && configuration.failureBehavior === 'block';
    options.logger.warn(
      {
        companyId: configuration.companyId,
        error: serializeError(error),
        failureBehavior: configuration.failureBehavior,
        failureCode,
        providerCode: configuration.providerCode,
        trackingClickId: input.trackingClickId,
      },
      'Tracker Proxy provider lookup failed.',
    );
    await applyProxyDecision(options.database, {
      trackingClickId: input.trackingClickId,
      companyId: input.companyId,
      outcome: 'provider_failed',
      providerCode: configuration.providerCode,
      riskScore: null,
      isProxy: null,
      isVpn: null,
      isTor: null,
      failureCode,
      snapshot: Object.freeze({
        enforcementMode: configuration.enforcementMode,
        failureBehavior: configuration.failureBehavior,
        source: 'provider_failure',
      }),
      checkedAt,
      blockAttribution: blocked,
    });
    return createDecision('provider_failed', blocked);
  }
  return Object.freeze({
    async evaluate(input: ProxyDetectionRequest): Promise<ProxyDetectionDecision> {
      const configuration = await getActiveConfiguration(options.database, input.companyId);
      if (configuration === undefined) {
        return createDecision('not_checked', false);
      }
      if (configuration.bypassOwnerMembershipIds.includes(input.ownerMembershipId)) {
        await applyProxyDecision(options.database, {
          trackingClickId: input.trackingClickId,
          companyId: input.companyId,
          outcome: 'bypassed',
          providerCode: null,
          riskScore: null,
          isProxy: null,
          isVpn: null,
          isTor: null,
          failureCode: null,
          snapshot: Object.freeze({
            reason: 'owner_membership_bypass',
          }),
          checkedAt: null,
          blockAttribution: false,
        });
        return createDecision('bypassed', false);
      }
      if (!isPublicIpAddress(input.ipAddress)) {
        await applyProxyDecision(options.database, {
          trackingClickId: input.trackingClickId,
          companyId: input.companyId,
          outcome: 'bypassed',
          providerCode: null,
          riskScore: null,
          isProxy: null,
          isVpn: null,
          isTor: null,
          failureCode: null,
          snapshot: Object.freeze({
            reason: 'non_public_ip',
          }),
          checkedAt: null,
          blockAttribution: false,
        });
        return createDecision('bypassed', false);
      }
      const cached = await getCachedDetection(
        options.database,
        input.companyId,
        configuration.providerCode,
        input.ipHash,
      );
      let detection: ProviderDetection;
      let checkedAt: string;
      let source: 'cache' | 'provider';
      if (cached !== undefined) {
        detection = Object.freeze({
          riskScore: cached.riskScore,
          isProxy: cached.isProxy,
          isVpn: cached.isVpn,
          isTor: cached.isTor,
          providerSnapshot: cached.providerSnapshot,
        });
        checkedAt = cached.checkedAt;
        source = 'cache';
      } else {
        let apiKey: string;
        try {
          apiKey = decryptor.decrypt(
            configuration.encryptedApiKey,
            configuration.apiKeyIv,
            configuration.apiKeyAuthTag,
          );
        } catch (error: unknown) {
          return persistFailure(configuration, input, error, 'PROXY_CREDENTIAL_DECRYPT_FAILED');
        }
        try {
          detection = await lookupProvider({
            providerCode: configuration.providerCode,
            apiKey,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
            timeoutMs: configuration.requestTimeoutMs,
          });
        } catch (error: unknown) {
          const failureCode =
            error instanceof ProxyProviderLookupError
              ? error.code
              : 'PROXY_PROVIDER_REQUEST_FAILED';
          return persistFailure(configuration, input, error, failureCode);
        }
        checkedAt = new Date().toISOString();
        source = 'provider';
        await upsertCachedDetection(
          options.database,
          configuration,
          input.ipHash,
          detection,
          checkedAt,
        );
      }
      const proxyDetected = configuration.detectProxy && detection.isProxy;
      const vpnDetected = configuration.detectVpn && detection.isVpn;
      const torDetected = configuration.detectTor && detection.isTor;
      const thresholdExceeded = detection.riskScore >= configuration.riskThreshold;
      const suspicious = proxyDetected || vpnDetected || torDetected || thresholdExceeded;
      const blocked = suspicious && configuration.enforcementMode === 'enforce';
      const outcome: ProxyDetectionOutcome = suspicious
        ? blocked
          ? 'blocked'
          : 'flagged'
        : 'clean';
      const countryIdentity = readProviderCountryIdentity(detection.providerSnapshot);
      await applyProxyDecision(options.database, {
        trackingClickId: input.trackingClickId,
        companyId: input.companyId,
        outcome,
        providerCode: configuration.providerCode,
        riskScore: detection.riskScore,
        isProxy: detection.isProxy,
        isVpn: detection.isVpn,
        isTor: detection.isTor,
        failureCode: null,
        snapshot: Object.freeze({
          source,
          threshold: configuration.riskThreshold,
          thresholdExceeded,
          proxySignalEnabled: configuration.detectProxy,
          vpnSignalEnabled: configuration.detectVpn,
          torSignalEnabled: configuration.detectTor,
          provider: detection.providerSnapshot,
        }),
        checkedAt,
        blockAttribution: blocked,
      });
      return createDecision(
        outcome,
        blocked,
        countryIdentity.countryCode,
        countryIdentity.countryName,
      );
    },
  });
}
