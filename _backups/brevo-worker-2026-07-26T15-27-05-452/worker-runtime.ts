import process from 'node:process';

import { serializeError, type ObservabilityLogger } from '@affiliate-tracker/observability';
import { Worker } from 'bullmq';
import type { ConnectionOptions, Job, Processor } from 'bullmq';

import type { WorkerRuntimeConfig } from './config.js';

const DEFAULT_REDIS_PORT = 6379;
const SYSTEM_QUEUE_NAME = 'system';
const SYSTEM_HEALTHCHECK_JOB_NAME = 'system.healthcheck';

interface SystemJobResult {
  processedAt: string;
  status: 'ok';
  workerProcessId: number;
}

export interface WorkerRuntime {
  close(): Promise<void>;
}

function resolveRedisDatabase(pathname: string): number | undefined {
  const databaseValue = pathname.replace(/^\/+/, '');

  if (databaseValue.length === 0) {
    return undefined;
  }

  if (!/^\d+$/.test(databaseValue)) {
    throw new Error('REDIS_URL database path must be a non-negative integer.');
  }

  return Number(databaseValue);
}

function resolveRedisConnection(value: string): ConnectionOptions {
  let redisUrl: URL;

  try {
    redisUrl = new URL(value);
  } catch {
    throw new Error('REDIS_URL must be a valid Redis connection URL.');
  }

  if (redisUrl.protocol !== 'redis:' && redisUrl.protocol !== 'rediss:') {
    throw new Error('REDIS_URL protocol must be either redis:// or rediss://.');
  }

  if (redisUrl.hostname.length === 0) {
    throw new Error('REDIS_URL must include a hostname.');
  }

  const redisPortValue = redisUrl.port.trim();
  const port = redisPortValue.length === 0 ? DEFAULT_REDIS_PORT : Number(redisPortValue);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('REDIS_URL port must be an integer between 1 and 65535.');
  }

  const database = resolveRedisDatabase(redisUrl.pathname);
  const username = redisUrl.username.length > 0 ? decodeURIComponent(redisUrl.username) : undefined;
  const password = redisUrl.password.length > 0 ? decodeURIComponent(redisUrl.password) : undefined;

  return {
    host: redisUrl.hostname,
    port,
    maxRetriesPerRequest: null,
    ...(username !== undefined ? { username } : {}),
    ...(password !== undefined ? { password } : {}),
    ...(database !== undefined ? { db: database } : {}),
    ...(redisUrl.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}

const processSystemJob: Processor<unknown, SystemJobResult> = (
  job: Job<unknown, SystemJobResult>,
): Promise<SystemJobResult> => {
  if (job.name !== SYSTEM_HEALTHCHECK_JOB_NAME) {
    return Promise.reject(new Error(`Unsupported system job name: ${job.name}`));
  }

  return Promise.resolve({
    status: 'ok',
    processedAt: new Date().toISOString(),
    workerProcessId: process.pid,
  });
};

export async function startWorkerRuntime(
  config: WorkerRuntimeConfig,
  logger: ObservabilityLogger,
): Promise<WorkerRuntime> {
  const connection = resolveRedisConnection(config.redis.url);
  const runtimeLogger = logger.child({
    component: 'bullmq-worker',
    queueName: SYSTEM_QUEUE_NAME,
  });

  const systemWorker = new Worker<unknown, SystemJobResult, string>(
    SYSTEM_QUEUE_NAME,
    processSystemJob,
    {
      connection,
      concurrency: config.queue.concurrency,
      prefix: config.queue.prefix,
    },
  );

  systemWorker.on('error', (error) => {
    runtimeLogger.error(
      {
        error: serializeError(error),
      },
      'BullMQ worker emitted an error.',
    );
  });

  systemWorker.on('failed', (job, error) => {
    runtimeLogger.error(
      {
        jobId: job?.id ?? null,
        jobName: job?.name ?? null,
        attemptsMade: job?.attemptsMade ?? null,
        error: serializeError(error),
      },
      'BullMQ job processing failed.',
    );
  });

  await systemWorker.waitUntilReady();

  runtimeLogger.info(
    {
      concurrency: config.queue.concurrency,
      queuePrefix: config.queue.prefix,
    },
    'BullMQ worker is ready.',
  );

  return {
    async close(): Promise<void> {
      runtimeLogger.info('BullMQ worker is closing.');

      await systemWorker.close();

      runtimeLogger.info('BullMQ worker closed.');
    },
  };
}
