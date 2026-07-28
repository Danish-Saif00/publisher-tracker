import type { ObservabilityLogger } from '@affiliate-tracker/observability';
import type { Job, Processor } from 'bullmq';

import {
  BrevoEmailError,
  type BrevoEmailClient,
} from './brevo-email.client.js';
import type { EmailPayloadCipher } from './email-payload-cipher.js';
import type { EmailNotificationPayload } from './email-notification.types.js';
import type { EmailNotificationRepository } from './email-notification.repository.js';

export const EMAIL_QUEUE_NAME = 'email-notifications';
export const EMAIL_DELIVERY_JOB_NAME = 'email.notification.deliver';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const MAX_RETRY_DELAY_MS = 86_400_000;

export interface EmailJobResult {
  readonly notificationId: string;
  readonly status: 'sent' | 'skipped' | 'failed';
  readonly reason: string | null;
  readonly messageId: string | null;
}

export interface EmailProcessorOptions {
  readonly repository: EmailNotificationRepository;
  readonly cipher: EmailPayloadCipher;
  readonly client: BrevoEmailClient;
  readonly logger: ObservabilityLogger;
  readonly baseBackoffMs: number;
}

interface JobData {
  readonly notificationId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJobData(value: unknown): JobData {
  if (!isRecord(value)) {
    throw new Error('Email job data must be an object.');
  }

  const notificationId = value['notificationId'];

  if (
    typeof notificationId !== 'string' ||
    !UUID_PATTERN.test(notificationId.trim())
  ) {
    throw new Error('Email job requires a valid notificationId UUID.');
  }

  return Object.freeze({
    notificationId: notificationId.trim(),
  });
}

function payloadString(
  payload: EmailNotificationPayload,
  fieldName: string,
): string {
  const value = payload[fieldName];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }

  return value.trim();
}

function errorData(
  error: unknown,
): Readonly<{
  code: string;
  message: string;
  retryable: boolean;
}> {
  if (error instanceof BrevoEmailError) {
    return Object.freeze({
      code: error.code
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9_]/gu, '_')
        .slice(0, 120),
      message: error.message.replace(/\s+/gu, ' ').trim().slice(0, 1_000),
      retryable: error.retryable,
    });
  }

  return Object.freeze({
    code: 'EMAIL_CONTENT_INVALID',
    message:
      error instanceof Error
        ? error.message.replace(/\s+/gu, ' ').trim().slice(0, 1_000)
        : 'Email processing failed.',
    retryable: false,
  });
}

function retryDelay(baseBackoffMs: number, attemptNumber: number): number {
  return Math.min(
    baseBackoffMs * 2 ** Math.max(0, attemptNumber - 1),
    MAX_RETRY_DELAY_MS,
  );
}

function result(
  notificationId: string,
  status: EmailJobResult['status'],
  reason: string | null,
  messageId: string | null,
): EmailJobResult {
  return Object.freeze({
    notificationId,
    status,
    reason,
    messageId,
  });
}

export function createEmailProcessor(
  options: EmailProcessorOptions,
): Processor<unknown, EmailJobResult> {
  const logger = options.logger.child({
    component: 'email-notification-processor',
  });

  return async (
    job: Job<unknown, EmailJobResult>,
  ): Promise<EmailJobResult> => {
    if (job.name !== EMAIL_DELIVERY_JOB_NAME) {
      throw new Error(`Unsupported email job: ${job.name}`);
    }

    const jobData = parseJobData(job.data);
    const claim = await options.repository.claim(jobData.notificationId);

    if (claim.kind === 'skipped') {
      if (claim.reason === 'processing') {
        throw new Error('Email notification is already processing.');
      }

      return result(jobData.notificationId, 'skipped', claim.reason, null);
    }

    const notification = claim.notification;

    try {
      if (notification.notificationType !== 'company_invitation') {
        throw new Error(
          `Unsupported notification type: ${notification.notificationType}`,
        );
      }

      if (notification.templateCode !== 'company_invitation_v1') {
        throw new Error(`Unsupported template: ${notification.templateCode}`);
      }

      const payload = options.cipher.decrypt(notification.encryptedPayload);

      const delivery = await options.client.send({
        recipientEmail: notification.recipientEmail,
        recipientName: notification.recipientName,
        subject: notification.subject,
        htmlContent: payloadString(payload, 'htmlContent'),
        textContent: payloadString(payload, 'textContent'),
      });

      await options.repository.markSent(
        notification.id,
        notification.attemptNumber,
        delivery.messageId,
      );

      logger.info(
        {
          notificationId: notification.id,
          attemptNumber: notification.attemptNumber,
          messageId: delivery.messageId,
        },
        'Email delivered through Brevo.',
      );

      return result(notification.id, 'sent', null, delivery.messageId);
    } catch (error: unknown) {
      const failure = errorData(error);
      const retryScheduled =
        failure.retryable &&
        notification.attemptNumber < notification.maxAttempts;
      const delay = retryScheduled
        ? retryDelay(options.baseBackoffMs, notification.attemptNumber)
        : 0;

      await options.repository.markFailed({
        notificationId: notification.id,
        attemptNumber: notification.attemptNumber,
        errorCode: failure.code,
        errorMessage: failure.message,
        retryScheduled,
        retryDelayMs: delay,
      });

      if (retryScheduled) {
        logger.warn(
          {
            notificationId: notification.id,
            attemptNumber: notification.attemptNumber,
            errorCode: failure.code,
            retryDelayMs: delay,
          },
          'Brevo delivery will be retried.',
        );

        throw new Error('Retryable Brevo delivery failure.', {
          cause: error,
        });
      }

      logger.error(
        {
          notificationId: notification.id,
          attemptNumber: notification.attemptNumber,
          errorCode: failure.code,
        },
        'Brevo delivery failed permanently.',
      );

      return result(notification.id, 'failed', failure.code, null);
    }
  };
}
