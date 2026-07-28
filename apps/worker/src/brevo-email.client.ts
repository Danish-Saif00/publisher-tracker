const BREVO_EMAIL_URL = 'https://api.brevo.com/v3/smtp/email';
const MAX_PROVIDER_MESSAGE_LENGTH = 1_000;

export interface BrevoEmailClientOptions {
  readonly apiKey: string;
  readonly senderEmail: string;
  readonly senderName: string;
  readonly requestTimeoutMs: number;
}

export interface BrevoEmailInput {
  readonly recipientEmail: string;
  readonly recipientName: string | null;
  readonly subject: string;
  readonly htmlContent: string;
  readonly textContent: string;
}

export interface BrevoEmailResult {
  readonly messageId: string;
}

export class BrevoEmailError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;
  public readonly statusCode: number | null;

  public constructor(
    message: string,
    code: string,
    retryable: boolean,
    statusCode: number | null,
    cause: unknown,
  ) {
    super(message);

    this.name = 'BrevoEmailError';
    this.code = code;
    this.retryable = retryable;
    this.statusCode = statusCode;

    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export interface BrevoEmailClient {
  send(input: BrevoEmailInput): Promise<BrevoEmailResult>;
}

function required(value: string, fieldName: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`${fieldName} cannot be empty.`);
  }

  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(value: string): unknown {
  if (value.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function providerMessage(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const message = value['message'];

  if (typeof message === 'string' && message.trim().length > 0) {
    return message.replace(/\s+/gu, ' ').trim().slice(0, MAX_PROVIDER_MESSAGE_LENGTH);
  }

  const code = value['code'];

  if (typeof code === 'string' && code.trim().length > 0) {
    return code.replace(/\s+/gu, ' ').trim().slice(0, MAX_PROVIDER_MESSAGE_LENGTH);
  }

  return null;
}

function retryableStatus(statusCode: number): boolean {
  return statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
}

function parseMessageId(responseBody: string): string {
  const body = parseJson(responseBody);

  if (!isRecord(body)) {
    throw new BrevoEmailError(
      'Brevo returned an invalid success response.',
      'BREVO_INVALID_RESPONSE',
      false,
      null,
      undefined,
    );
  }

  const messageId = body['messageId'];

  if (
    typeof messageId !== 'string' ||
    messageId.trim().length === 0 ||
    messageId.length > 500
  ) {
    throw new BrevoEmailError(
      'Brevo returned an invalid message identifier.',
      'BREVO_INVALID_MESSAGE_ID',
      false,
      null,
      undefined,
    );
  }

  return messageId.trim();
}

export function createBrevoEmailClient(
  options: BrevoEmailClientOptions,
): BrevoEmailClient {
  const apiKey = required(options.apiKey, 'Brevo API key');
  const senderEmail = required(options.senderEmail, 'Brevo sender email');
  const senderName = required(options.senderName, 'Brevo sender name');

  if (
    !Number.isInteger(options.requestTimeoutMs) ||
    options.requestTimeoutMs < 1_000 ||
    options.requestTimeoutMs > 120_000
  ) {
    throw new Error(
      'Brevo timeout must be an integer between 1000 and 120000 milliseconds.',
    );
  }

  return Object.freeze<BrevoEmailClient>({
    async send(input: BrevoEmailInput): Promise<BrevoEmailResult> {
      const recipientEmail = required(input.recipientEmail, 'Recipient email');
      const recipientName =
        input.recipientName === null
          ? null
          : required(input.recipientName, 'Recipient name');
      const subject = required(input.subject, 'Email subject');
      const htmlContent = required(input.htmlContent, 'HTML content');
      const textContent = required(input.textContent, 'Text content');

      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, options.requestTimeoutMs);

      timeout.unref();

      try {
        let response: Awaited<ReturnType<typeof fetch>>;

        try {
          response = await fetch(BREVO_EMAIL_URL, {
            method: 'POST',
            headers: {
              accept: 'application/json',
              'api-key': apiKey,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              sender: {
                email: senderEmail,
                name: senderName,
              },
              to: [
                {
                  email: recipientEmail,
                  ...(recipientName === null ? {} : { name: recipientName }),
                },
              ],
              subject,
              htmlContent,
              textContent,
            }),
            signal: controller.signal,
          });
        } catch (error: unknown) {
          if (controller.signal.aborted) {
            throw new BrevoEmailError(
              'Brevo request timed out.',
              'BREVO_TIMEOUT',
              true,
              null,
              error,
            );
          }

          throw new BrevoEmailError(
            'Brevo request could not reach the provider.',
            'BREVO_NETWORK_ERROR',
            true,
            null,
            error,
          );
        }

        const body = await response.text();

        if (!response.ok) {
          const message = providerMessage(parseJson(body));
          const statusText = String(response.status);

          throw new BrevoEmailError(
            message === null
              ? `Brevo rejected the request with HTTP ${statusText}.`
              : `Brevo rejected the request: ${message}`,
            `BREVO_HTTP_${statusText}`,
            retryableStatus(response.status),
            response.status,
            undefined,
          );
        }

        return Object.freeze({
          messageId: parseMessageId(body),
        });
      } finally {
        clearTimeout(timeout);
      }
    },
  });
}
