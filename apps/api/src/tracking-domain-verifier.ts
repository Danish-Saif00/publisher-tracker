import { resolveCname, resolveTxt } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';

const OWNERSHIP_RECORD_PREFIX = '_publisher-tracker';
const OWNERSHIP_VALUE_PREFIX = 'publisher-tracker-verification=';

export interface TrackingDomainVerificationResult {
  readonly verified: boolean;
  readonly observedValues: readonly string[];
}

export interface TrackingDomainTlsVerificationResult {
  readonly verified: boolean;
  readonly statusCode: number | null;
  readonly errorCode: string | null;
}

export interface TrackingDomainVerifier {
  getOwnershipRecordName(hostname: string): string;
  getOwnershipRecordValue(verificationToken: string): string;
  verifyOwnership(
    hostname: string,
    verificationToken: string,
  ): Promise<TrackingDomainVerificationResult>;
  verifyCname(hostname: string, expectedTarget: string): Promise<TrackingDomainVerificationResult>;
  verifyTls(hostname: string): Promise<TrackingDomainTlsVerificationResult>;
}

export interface CreateTrackingDomainVerifierOptions {
  readonly tlsTimeoutMs?: number;
  readonly resolveTxtImplementation?: typeof resolveTxt;
  readonly resolveCnameImplementation?: typeof resolveCname;
}

function normalizeHostname(value: string): string {
  return value.trim().toLowerCase().replace(/\.+$/u, '');
}

function isDnsNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    ['ENODATA', 'ENOTFOUND', 'ESERVFAIL', 'ETIMEOUT'].includes(error.code)
  );
}

function verifyHttpsHealth(
  hostname: string,
  timeoutMs: number,
): Promise<TrackingDomainTlsVerificationResult> {
  return new Promise((resolve) => {
    const request = httpsRequest(
      {
        hostname,
        method: 'HEAD',
        path: '/health',
        port: 443,
        servername: hostname,
        timeout: timeoutMs,
      },
      (response) => {
        response.resume();
        const statusCode = response.statusCode ?? null;

        resolve(
          Object.freeze({
            verified: statusCode !== null && statusCode >= 200 && statusCode < 400,
            statusCode,
            errorCode: null,
          }),
        );
      },
    );

    request.once('timeout', () => {
      request.destroy(new Error('TLS probe timed out.'));
    });

    request.once('error', (error: NodeJS.ErrnoException) => {
      resolve(
        Object.freeze({
          verified: false,
          statusCode: null,
          errorCode: error.code ?? 'TLS_PROBE_FAILED',
        }),
      );
    });

    request.end();
  });
}

export function createTrackingDomainVerifier(
  options: CreateTrackingDomainVerifierOptions = {},
): TrackingDomainVerifier {
  const tlsTimeoutMs = options.tlsTimeoutMs ?? 10_000;
  const resolveTxtImplementation = options.resolveTxtImplementation ?? resolveTxt;
  const resolveCnameImplementation = options.resolveCnameImplementation ?? resolveCname;

  return Object.freeze<TrackingDomainVerifier>({
    getOwnershipRecordName(hostname) {
      return `${OWNERSHIP_RECORD_PREFIX}.${normalizeHostname(hostname)}`;
    },

    getOwnershipRecordValue(verificationToken) {
      return `${OWNERSHIP_VALUE_PREFIX}${verificationToken.trim()}`;
    },

    async verifyOwnership(hostname, verificationToken) {
      const recordName = `${OWNERSHIP_RECORD_PREFIX}.${normalizeHostname(hostname)}`;
      const expectedValue = `${OWNERSHIP_VALUE_PREFIX}${verificationToken.trim()}`;

      try {
        const records = await resolveTxtImplementation(recordName);
        const observedValues = Object.freeze(records.map((segments) => segments.join('')));

        return Object.freeze({
          verified: observedValues.includes(expectedValue),
          observedValues,
        });
      } catch (error: unknown) {
        if (!isDnsNotFoundError(error)) {
          throw error;
        }

        return Object.freeze({
          verified: false,
          observedValues: Object.freeze([]),
        });
      }
    },

    async verifyCname(hostname, expectedTarget) {
      try {
        const records = await resolveCnameImplementation(normalizeHostname(hostname));
        const observedValues = Object.freeze(records.map(normalizeHostname));

        return Object.freeze({
          verified: observedValues.includes(normalizeHostname(expectedTarget)),
          observedValues,
        });
      } catch (error: unknown) {
        if (!isDnsNotFoundError(error)) {
          throw error;
        }

        return Object.freeze({
          verified: false,
          observedValues: Object.freeze([]),
        });
      }
    },

    async verifyTls(hostname) {
      return verifyHttpsHealth(normalizeHostname(hostname), tlsTimeoutMs);
    },
  });
}
