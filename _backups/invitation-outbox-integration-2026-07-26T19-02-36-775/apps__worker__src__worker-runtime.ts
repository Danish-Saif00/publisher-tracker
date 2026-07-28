import process from 'node:process';

import type { DatabaseRuntime } from '@affiliate-tracker/database';
import {
  serializeError,
  type ObservabilityLogger,
} from '@affiliate-tracker/observability';
import { Worker } from 'bullmq';
import type { ConnectionOptions, Job, Processor } from 'bullmq';

import { createBrevoEmailClient } from './brevo-email.client.js';
import type { WorkerRuntimeConfig } from './config.js';
import { createEmailPayloadCipher } from './email-payload-cipher.js';
import {
  startEmailNotificationDispatcher,
  type EmailNotificationDispatcher,
} from './email-notification.dispatcher.js';
import {
  createEmailProcessor,
  EMAIL_DELIVERY_JOB_NAME,
  EMAIL_QUEUE_NAME,
  type EmailJobResult,
} from './email-notification.processor.js';
import { createEmailNotificationRepository } from './email-notification.repository.js';

const DEFAULT_REDIS_PORT = 6379;
const SYSTEM_QUEUE_NAME = 'system';
const SYSTEM_JOB_NAME = 'system.healthcheck';

interface SystemJobResult {
  readonly processedAt: string;
  readonly status: 'ok';
  readonly workerProcessId: number;
}

export interface WorkerRuntime {
  close(): Promise<void>;
}

function redisDatabase(pathname: string): number | undefined {
  const value = pathname.replace(/^\/+/u, '');

  if (value.length === 0) {
    return undefined;
  }

  if (!/^\d+$/u.test(value)) {
    throw new Error(
      'REDIS_URL database path must be a non-negative integer.',
    );
  }

  return Number(value);
}

function redisConnection(value: string): ConnectionOptions {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error('REDIS_URL must be a valid Redis URL.');
  }

  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new Error('REDIS_URL protocol must be redis or rediss.');
  }

  if (url.hostname.length === 0) {
    throw new Error('REDIS_URL must include a hostname.');
  }

  const port = url.port.length === 0 ? DEFAULT_REDIS_PORT : Number(url.port);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('REDIS_URL port is invalid.');
  }

  const database = redisDatabase(url.pathname);
  const username =
    url.username.length === 0 ? undefined : decodeURIComponent(url.username);
  const password =
    url.password.length === 0 ? undefined : decodeURIComponent(url.password);

  return {
    host: url.hostname,
    port,
    maxRetriesPerRequest: null,
    ...(username === undefined ? {} : { username }),
    ...(password === undefined ? {} : { password }),
    ...(database === undefined ? {} : { db: database }),
    ...(url.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

const processSystemJob: Processor<unknown, SystemJobResult> = (
  job: Job<unknown, SystemJobResult>,
): Promise<SystemJobResult> => {
  if (job.name !== SYSTEM_JOB_NAME) {
    return Promise.reject(new Error(`Unsupported system job: ${job.name}`));
  }

  return Promise.resolve({
    status: 'ok',
    processedAt: new Date().toISOString(),
    workerProcessId: process.pid,
  });
};

function registerLogging<TData, TResult>(
  worker: Worker<TData, TResult>,
  logger: ObservabilityLogger,
  queueName: string,
): void {
  worker.on('error', (error) => {
    logger.error(
      {
        queueName,
        error: serializeError(error),
      },
      'BullMQ worker error.',
    );
  });

  worker.on('failed', (job, error) => {
    logger.error(
      {
        queueName,
        jobId: job?.id ?? null,
        jobName: job?.name ?? null,
        attemptsMade: job?.attemptsMade ?? null,
        error: serializeError(error),
      },
      'BullMQ job failed.',
    );
  });
}

export async function startWorkerRuntime(
  config: WorkerRuntimeConfig,
  database: DatabaseRuntime,
  logger: ObservabilityLogger,
): Promise<WorkerRuntime> {
  const connection = redisConnection(config.redis.url);
  const runtimeLogger = logger.child({
    component: 'bullmq-worker',
  });

  const systemWorker = new Worker<unknown, SystemJobResult>(
    SYSTEM_QUEUE_NAME,
    processSystemJob,
    {
      connection,
      concurrency: 1,
      prefix: config.queue.prefix,
    },
  );

  const repository = createEmailNotificationRepository(database);
  const cipher = createEmailPayloadCipher(config.security.dataEncryptionKey);
  const client = createBrevoEmailClient({
    apiKey: config.email.apiKey,
    senderEmail: config.email.senderEmail,
    senderName: config.email.senderName,
    requestTimeoutMs: config.email.requestTimeoutMs,
  });
  const processor = createEmailProcessor({
    repository,
    cipher,
    client,
    logger: runtimeLogger,
    baseBackoffMs: config.queue.jobBackoffMs,
  });
  const emailWorker = new Worker<unknown, EmailJobResult>(
    EMAIL_QUEUE_NAME,
    processor,
    {
      connection,
      concurrency: config.queue.concurrency,
      prefix: config.queue.prefix,
    },
  );

  registerLogging(systemWorker, runtimeLogger, SYSTEM_QUEUE_NAME);
  registerLogging(emailWorker, runtimeLogger, EMAIL_QUEUE_NAME);

  let dispatcher: EmailNotificationDispatcher;

  try {
    await Promise.all([
      systemWorker.waitUntilReady(),
      emailWorker.waitUntilReady(),
    ]);

    dispatcher = await startEmailNotificationDispatcher({
      database,
      connection,
      queuePrefix: config.queue.prefix,
      jobAttempts: config.queue.jobAttempts,
      jobBackoffMs: config.queue.jobBackoffMs,
      logger: runtimeLogger,
    });
  } catch (error: unknown) {
    await Promise.allSettled([
      emailWorker.close(),
      systemWorker.close(),
    ]);

    throw error;
  }

  runtimeLogger.info(
    {
      queuePrefix: config.queue.prefix,
      emailQueue: EMAIL_QUEUE_NAME,
      emailJob: EMAIL_DELIVERY_JOB_NAME,
      emailConcurrency: config.queue.concurrency,
      jobAttempts: config.queue.jobAttempts,
      jobBackoffMs: config.queue.jobBackoffMs,
    },
    'BullMQ workers and email dispatcher are ready.',
  );

  return Object.freeze({
    async close(): Promise<void> {
      runtimeLogger.info(
        'BullMQ workers and email dispatcher are closing.',
      );

      await dispatcher.close();

      await Promise.all([
        emailWorker.close(),
        systemWorker.close(),
      ]);

      runtimeLogger.info(
        'BullMQ workers and email dispatcher closed.',
      );
    },
  });
}
