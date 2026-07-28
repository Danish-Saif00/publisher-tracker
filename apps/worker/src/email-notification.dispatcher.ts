import type { DatabaseRuntime } from '@affiliate-tracker/database';
import type { ObservabilityLogger } from '@affiliate-tracker/observability';
import { Queue } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';

import {
  EMAIL_DELIVERY_JOB_NAME,
  EMAIL_QUEUE_NAME,
  type EmailJobResult,
} from './email-notification.processor.js';

const DEFAULT_DISPATCH_INTERVAL_MS = 5_000;
const DEFAULT_DISPATCH_BATCH_SIZE = 100;

type NotificationIdRow =
  Readonly<{
    id: string;
  }> &
  Record<string, unknown>;

interface EmailNotificationJobData {
  readonly notificationId: string;
}

export interface EmailNotificationDispatcherOptions {
  readonly database: DatabaseRuntime;
  readonly connection: ConnectionOptions;
  readonly queuePrefix: string;
  readonly jobAttempts: number;
  readonly jobBackoffMs: number;
  readonly logger: ObservabilityLogger;
  readonly intervalMs?: number;
  readonly batchSize?: number;
}

export interface EmailNotificationDispatcher {
  close(): Promise<void>;
}

function validatePositiveInteger(
  value: number,
  fieldName: string,
  maximum: number,
): number {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(
      `${fieldName} must be an integer between 1 and ${String(maximum)}.`,
    );
  }

  return value;
}

export async function startEmailNotificationDispatcher(
  options: EmailNotificationDispatcherOptions,
): Promise<EmailNotificationDispatcher> {
  const intervalMs = validatePositiveInteger(
    options.intervalMs ?? DEFAULT_DISPATCH_INTERVAL_MS,
    'Email dispatch interval',
    300_000,
  );
  const batchSize = validatePositiveInteger(
    options.batchSize ?? DEFAULT_DISPATCH_BATCH_SIZE,
    'Email dispatch batch size',
    1_000,
  );
  const jobAttempts = validatePositiveInteger(
    options.jobAttempts,
    'Email job attempts',
    20,
  );
  const jobBackoffMs = validatePositiveInteger(
    options.jobBackoffMs,
    'Email job backoff',
    86_400_000,
  );
  const logger = options.logger.child({
    component: 'email-notification-dispatcher',
    queueName: EMAIL_QUEUE_NAME,
  });
  const queue = new Queue<
    EmailNotificationJobData,
    EmailJobResult
  >(EMAIL_QUEUE_NAME, {
    connection: options.connection,
    prefix: options.queuePrefix,
  });

  let closed = false;
  let activeDispatch: Promise<void> | undefined;

  async function dispatchDueNotifications(): Promise<void> {
    // email_notification_dispatcher_reliability_v2
    await options.database.query({
      name: 'email-notification-dispatcher-recover-stale-queued',
      text: `
        update public.email_notifications
        set
          status = 'pending',
          queued_at = null
        where status = 'queued'
          and queued_at <= now() - interval '2 minutes'
      `,
      values: [],
    });

    const result = await options.database.query<NotificationIdRow>({
      name: 'email-notification-dispatcher-list-due',
      text: `
        select id
        from public.email_notifications
        where status in ('pending', 'retry_scheduled')
          and available_at <= now()
        order by available_at asc, created_at asc, id asc
        limit $1
      `,
      values: [batchSize],
    });

    for (const row of result.rows) {
      try {
        await queue.add(
          EMAIL_DELIVERY_JOB_NAME,
          {
            notificationId: row.id,
          },
          {
            jobId: row.id,
            attempts: jobAttempts,
            backoff: {
              type: 'exponential',
              delay: jobBackoffMs,
            },
            removeOnComplete: {
              count: 1_000,
            },
            removeOnFail: {
              count: 5_000,
            },
          },
        );

        await options.database.query({
          name: 'email-notification-dispatcher-mark-queued',
          text: `
            update public.email_notifications
            set
              status = 'queued',
              queued_at = coalesce(queued_at, now())
            where id = $1
              and status in ('pending', 'retry_scheduled')
          `,
          values: [row.id],
        });
      } catch (error: unknown) {
        logger.error(
          {
            notificationId: row.id,
            error,
          },
          'Email notification could not be dispatched to BullMQ.',
        );
      }
    }
  }

  function requestDispatch(): void {
    if (closed || activeDispatch !== undefined) {
      return;
    }

    activeDispatch = dispatchDueNotifications()
      .catch((error: unknown) => {
        logger.error(
          {
            error,
          },
          'Email notification dispatch cycle failed.',
        );
      })
      .finally(() => {
        activeDispatch = undefined;
      });
  }

  await queue.waitUntilReady();
  await dispatchDueNotifications();

  const interval = setInterval(
    requestDispatch,
    intervalMs,
  );

  logger.info(
    {
      intervalMs,
      batchSize,
      jobAttempts,
      jobBackoffMs,
    },
    'Email notification dispatcher started.',
  );

  return Object.freeze<EmailNotificationDispatcher>({
    async close(): Promise<void> {
      closed = true;
      clearInterval(interval);

      if (activeDispatch !== undefined) {
        await activeDispatch;
      }

      await queue.close();

      logger.info(
        'Email notification dispatcher closed.',
      );
    },
  });
}
