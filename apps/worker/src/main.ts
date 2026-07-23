import process from 'node:process';

import { loadRootEnvironmentFile } from '@affiliate-tracker/config';

import { createDatabase, type DatabaseRuntime } from '@affiliate-tracker/database';
import {
  createLogger,
  serializeError,
  type ObservabilityLogger,
} from '@affiliate-tracker/observability';

import { loadWorkerConfig } from './config.js';
import { startWorkerRuntime } from './worker-runtime.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

function createFallbackLogger(): ObservabilityLogger {
  return createLogger({
    service: 'worker',
    environment: 'development',
    level: 'error',
    pretty: false,
    baseBindings: {
      loggerMode: 'startup-fallback',
    },
  });
}

async function closeDatabaseAfterStartupFailure(
  database: DatabaseRuntime,
  logger: ObservabilityLogger,
): Promise<void> {
  try {
    await database.close();
  } catch (error: unknown) {
    logger.error(
      {
        error: serializeError(error),
      },
      'Worker database failed to close after a startup failure.',
    );
  }
}

function combineShutdownErrors(currentError: unknown, nextError: unknown): unknown {
  if (currentError === undefined) {
    return nextError;
  }

  return new AggregateError(
    [currentError, nextError],
    'Multiple worker resources failed to close cleanly.',
  );
}

async function bootstrap(): Promise<void> {
  const config = loadWorkerConfig();
  const logger = createLogger({
    service: 'worker',
    environment: config.application.environment,
    level: config.application.logLevel,
    pretty: config.application.prettyLogs,
  });

  const database = createDatabase({
    applicationName: 'affiliate-tracker-worker',
    connectionString: config.database.connectionString,
    logger,
    minConnections: config.database.minConnections,
    maxConnections: config.database.maxConnections,
    queryTimeoutMs: config.database.queryTimeoutMs,
  });

  try {
    await database.checkHealth();

    logger.info('Worker database connection verified.');

    const runtime = await startWorkerRuntime(config, logger);

    let shutdownStarted = false;

    async function shutdown(signal: NodeJS.Signals): Promise<void> {
      if (shutdownStarted) {
        return;
      }

      shutdownStarted = true;

      logger.info(
        {
          signal,
        },
        'Worker shutdown started.',
      );

      const forcedShutdownTimer = setTimeout(() => {
        logger.error(
          {
            timeoutMs: SHUTDOWN_TIMEOUT_MS,
          },
          'Worker graceful shutdown timed out.',
        );

        process.exitCode = 1;
      }, SHUTDOWN_TIMEOUT_MS);

      forcedShutdownTimer.unref();

      let shutdownError: unknown;

      try {
        await runtime.close();
      } catch (error: unknown) {
        shutdownError = combineShutdownErrors(shutdownError, error);
      }

      try {
        await database.close();
      } catch (error: unknown) {
        shutdownError = combineShutdownErrors(shutdownError, error);
      }

      clearTimeout(forcedShutdownTimer);

      if (shutdownError !== undefined) {
        logger.error(
          {
            error: serializeError(shutdownError),
          },
          'Worker resources failed to close cleanly.',
        );

        process.exitCode = 1;
        return;
      }

      logger.info('Worker shutdown completed.');
    }

    process.once('SIGINT', () => {
      void shutdown('SIGINT');
    });

    process.once('SIGTERM', () => {
      void shutdown('SIGTERM');
    });

    logger.info(
      {
        queuePrefix: config.queue.prefix,
        concurrency: config.queue.concurrency,
      },
      'Worker runtime started.',
    );
  } catch (error: unknown) {
    await closeDatabaseAfterStartupFailure(database, logger);
    throw error;
  }
}

try {
  loadRootEnvironmentFile();
  await bootstrap();
} catch (error: unknown) {
  const fallbackLogger = createFallbackLogger();

  fallbackLogger.error(
    {
      error: serializeError(error),
    },
    'Worker runtime failed to start.',
  );

  process.exitCode = 1;
}
