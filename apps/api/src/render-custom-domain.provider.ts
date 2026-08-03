import {
  CustomDomainProviderError,
  type CustomDomainProvider,
  type CustomDomainProviderRecord,
  type CustomDomainProviderVerificationStatus,
} from './custom-domain-provider.js';

const RENDER_API_BASE_URL = 'https://api.render.com/v1';
const MAX_ERROR_BODY_LENGTH = 1_000;

export interface CreateRenderCustomDomainProviderOptions {
  readonly apiKey: string;
  readonly serviceId: string;
  readonly serviceHostname: string;
  readonly fetchImplementation?: typeof fetch;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRequiredString(
  value: Readonly<Record<string, unknown>>,
  propertyName: string,
): string {
  const propertyValue = value[propertyName];

  if (typeof propertyValue !== 'string' || propertyValue.trim().length === 0) {
    throw new CustomDomainProviderError(
      'RENDER_RESPONSE_INVALID',
      `Render returned an invalid custom-domain ${propertyName}.`,
    );
  }

  return propertyValue;
}

function readVerificationStatus(
  value: Readonly<Record<string, unknown>>,
): CustomDomainProviderVerificationStatus {
  const status = value['verificationStatus'];

  if (status === 'verified' || status === 'unverified') {
    return status;
  }

  throw new CustomDomainProviderError(
    'RENDER_RESPONSE_INVALID',
    'Render returned an unsupported custom-domain verification status.',
  );
}

function parseCustomDomain(value: unknown): CustomDomainProviderRecord {
  if (!isRecord(value)) {
    throw new CustomDomainProviderError(
      'RENDER_RESPONSE_INVALID',
      'Render returned an invalid custom-domain payload.',
    );
  }

  return Object.freeze({
    id: readRequiredString(value, 'id'),
    name: readRequiredString(value, 'name').trim().toLowerCase(),
    verificationStatus: readVerificationStatus(value),
  });
}

function parseCreateResponse(value: unknown, hostname: string): CustomDomainProviderRecord {
  if (!Array.isArray(value)) {
    return parseCustomDomain(value);
  }

  const matchingDomain = value.map(parseCustomDomain).find((domain) => domain.name === hostname);

  if (matchingDomain === undefined) {
    throw new CustomDomainProviderError(
      'RENDER_RESPONSE_INVALID',
      'Render did not return the requested custom domain.',
    );
  }

  return matchingDomain;
}

async function readResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  const rawBody = await response.text();

  if (rawBody.trim().length === 0) {
    return undefined;
  }

  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.toLowerCase().includes('application/json')) {
    try {
      return JSON.parse(rawBody) as unknown;
    } catch {
      throw new CustomDomainProviderError(
        'RENDER_RESPONSE_INVALID',
        'Render returned malformed JSON.',
        response.status,
      );
    }
  }

  return rawBody;
}

function readProviderErrorMessage(body: unknown, statusCode: number): string {
  if (isRecord(body) && typeof body['message'] === 'string') {
    return body['message'].slice(0, MAX_ERROR_BODY_LENGTH);
  }

  if (isRecord(body) && isRecord(body['error']) && typeof body['error']['message'] === 'string') {
    return body['error']['message'].slice(0, MAX_ERROR_BODY_LENGTH);
  }

  if (typeof body === 'string' && body.trim().length > 0) {
    return body.trim().slice(0, MAX_ERROR_BODY_LENGTH);
  }

  return `Render custom-domain request failed with HTTP ${String(statusCode)}.`;
}

function createRenderError(statusCode: number, body: unknown): CustomDomainProviderError {
  return new CustomDomainProviderError(
    `RENDER_HTTP_${String(statusCode)}`,
    readProviderErrorMessage(body, statusCode),
    statusCode,
  );
}

function normalizeRequiredValue(value: string, fieldName: string): string {
  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalizedValue;
}

function normalizeHostname(value: string): string {
  return normalizeRequiredValue(value, 'Render tracker service hostname')
    .toLowerCase()
    .replace(/\.+$/u, '');
}

export function createRenderCustomDomainProvider(
  options: CreateRenderCustomDomainProviderOptions,
): CustomDomainProvider {
  const apiKey = normalizeRequiredValue(options.apiKey, 'Render API key');
  const serviceId = normalizeRequiredValue(options.serviceId, 'Render tracker service ID');
  const dnsTarget = normalizeHostname(options.serviceHostname);
  const fetchImplementation = options.fetchImplementation ?? fetch;

  async function request(path: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    const headers = new Headers(init.headers);

    headers.set('accept', 'application/json');
    headers.set('authorization', `Bearer ${apiKey}`);

    if (init.body !== undefined) {
      headers.set('content-type', 'application/json');
    }

    try {
      response = await fetchImplementation(`${RENDER_API_BASE_URL}${path}`, {
        ...init,
        headers,
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new CustomDomainProviderError(
        'RENDER_NETWORK_ERROR',
        'Render custom-domain API could not be reached.',
        null,
      );
    }

    const body = await readResponseBody(response);

    if (!response.ok) {
      throw createRenderError(response.status, body);
    }

    return body;
  }

  function customDomainPath(customDomainNameOrId?: string): string {
    const basePath = `/services/${encodeURIComponent(serviceId)}/custom-domains`;

    return customDomainNameOrId === undefined
      ? basePath
      : `${basePath}/${encodeURIComponent(customDomainNameOrId)}`;
  }

  return Object.freeze<CustomDomainProvider>({
    name: 'render',
    dnsTarget,

    async create(hostname) {
      const normalizedHostname = normalizeHostname(hostname);
      const body = await request(customDomainPath(), {
        method: 'POST',
        body: JSON.stringify({ name: normalizedHostname }),
      });

      return parseCreateResponse(body, normalizedHostname);
    },

    async retrieve(customDomainNameOrId) {
      const body = await request(customDomainPath(customDomainNameOrId), {
        method: 'GET',
      });

      return parseCustomDomain(body);
    },

    async verify(customDomainNameOrId) {
      await request(`${customDomainPath(customDomainNameOrId)}/verify`, {
        method: 'POST',
      });
    },

    async delete(customDomainNameOrId) {
      await request(customDomainPath(customDomainNameOrId), {
        method: 'DELETE',
      });
    },
  });
}
