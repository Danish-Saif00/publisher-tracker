import { createServer, type Server } from 'node:http';
import process from 'node:process';

import { createDatabase, type DatabaseRuntime } from '@affiliate-tracker/database';
import {
  createLogger,
  serializeError,
  type ObservabilityLogger,
} from '@affiliate-tracker/observability';

import { createApp } from './app.js';
import { loadTrackerConfig } from './config.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

function createFallbackLogger(): ObservabilityLogger {
  return createLogger({
    service: 'tracker',
    environment: 'development',
    level: 'error',
    pretty: false,
    baseBindings: {
      loggerMode: 'startup-fallback',
    },
  });
}

function startHttpServer(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const handleError = (error: Error): void => {
      server.off('listening', handleListening);
      reject(error);
    };

    const handleListening = (): void => {
      server.off('error', handleError);
      resolve();
    };

    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(port, host);
  });
}

function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }

      resolve();
    });
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
      'Tracker database failed to close after a startup failure.',
    );
  }
}

function combineShutdownErrors(currentError: unknown, nextError: unknown): unknown {
  if (currentError === undefined) {
    return nextError;
  }

  return new AggregateError(
    [currentError, nextError],
    'Multiple tracker resources failed to close cleanly.',
  );
}

async function bootstrap(): Promise<void> {
  const config = loadTrackerConfig();
  const logger = createLogger({
    service: 'tracker',
    environment: config.application.environment,
    level: config.application.logLevel,
    pretty: config.application.prettyLogs,
  });

  const database = createDatabase({
    applicationName: 'affiliate-tracker-tracker',
    connectionString: config.database.connectionString,
    logger,
    minConnections: config.database.minConnections,
    maxConnections: config.database.maxConnections,
    queryTimeoutMs: config.database.queryTimeoutMs,
  });

  try {
    await database.checkHealth();

    logger.info('Tracker database connection verified.');

    const app = createApp(config);
    const server = createServer(app);

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
        'Tracker shutdown started.',
      );

      const forcedShutdownTimer = setTimeout(() => {
        logger.error(
          {
            timeoutMs: SHUTDOWN_TIMEOUT_MS,
          },
          'Tracker graceful shutdown timed out.',
        );

        server.closeAllConnections();
        process.exitCode = 1;
      }, SHUTDOWN_TIMEOUT_MS);

      forcedShutdownTimer.unref();

      let shutdownError: unknown;

      try {
        await closeHttpServer(server);
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
          'Tracker resources failed to close cleanly.',
        );

        process.exitCode = 1;
        return;
      }

      logger.info('Tracker shutdown completed.');
    }

    process.once('SIGINT', () => {
      void shutdown('SIGINT');
    });

    process.once('SIGTERM', () => {
      void shutdown('SIGTERM');
    });

    await startHttpServer(server, config.server.host, config.server.port);

    server.on('error', (error) => {
      logger.error(
        {
          error: serializeError(error),
        },
        'Tracker server encountered an error.',
      );

      process.exitCode = 1;
    });

    logger.info(
      {
        host: config.server.host,
        port: config.server.port,
      },
      'Tracker server started.',
    );
  } catch (error: unknown) {
    await closeDatabaseAfterStartupFailure(database, logger);
    throw error;
  }
}

try {
  await bootstrap();
} catch (error: unknown) {
  const fallbackLogger = createFallbackLogger();

  fallbackLogger.error(
    {
      error: serializeError(error),
    },
    'Tracker failed to start.',
  );

  process.exitCode = 1;
}
