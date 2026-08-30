import { createServer, type Server } from 'node:http';
import process from 'node:process';

import { loadRootEnvironmentFile } from '@affiliate-tracker/config';

import { createDatabase, type DatabaseRuntime } from '@affiliate-tracker/database';
import {
  createLogger,
  serializeError,
  type ObservabilityLogger,
} from '@affiliate-tracker/observability';

import { createApp } from './app.js';
import { loadTrackerConfig } from './config.js';
import { createInAppBrowserPolicyRepository } from './in-app-browser-policy.repository.js';
import { createInAppBrowserPolicyService } from './in-app-browser-policy.service.js';
import { createNetworkPostbackRepository } from './network-postback.repository.js';
import { createNetworkPostbackService } from './network-postback.service.js';
import { createProxyDetectionRuntime } from './proxy-detection.runtime.js';
import { createTrackingLinkResolverRepository } from './tracking-link-resolver.repository.js';
import { createTrackingLinkResolverService } from './tracking-link-resolver.service.js';
import { createTrackingPreviewService } from './tracking-preview.service.js';
import { createVisitorIdentityService } from './visitor-identity.service.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;
const HTTP_REQUEST_TIMEOUT_MS = 30_000;
const HTTP_HEADERS_TIMEOUT_MS = 35_000;
const HTTP_KEEP_ALIVE_TIMEOUT_MS = 5_000;
const HTTP_MAX_HEADERS_COUNT = 100;

function configureHttpServer(server: Server): void {
  server.requestTimeout = HTTP_REQUEST_TIMEOUT_MS;
  server.headersTimeout = HTTP_HEADERS_TIMEOUT_MS;
  server.keepAliveTimeout = HTTP_KEEP_ALIVE_TIMEOUT_MS;
  server.maxHeadersCount = HTTP_MAX_HEADERS_COUNT;
}

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

    const networkPostbackRepository = createNetworkPostbackRepository(database);
    const networkPostbackService = createNetworkPostbackService(networkPostbackRepository);

    const inAppBrowserPolicyRepository = createInAppBrowserPolicyRepository(database);
    const inAppBrowserPolicyService = createInAppBrowserPolicyService(inAppBrowserPolicyRepository);
    const trackingPreviewService = createTrackingPreviewService(inAppBrowserPolicyRepository);

    const trackingLinkResolverRepository = createTrackingLinkResolverRepository(database);
    const proxyDetectionService = createProxyDetectionRuntime({
      database,
      encryptionKey: config.security.dataEncryptionKey,
      logger,
    });
    const visitorIdentityService = createVisitorIdentityService({
      cookieName: config.tracking.cookieName,
      maxAgeDays: config.tracking.cookieMaxAgeDays,
      signingSecret: config.security.visitorIdSigningSecret,
      secureCookies: config.tracking.secureCookies,
    });

    const trackingLinkResolverService = createTrackingLinkResolverService(
      trackingLinkResolverRepository,
      visitorIdentityService,
      {
        ipHashSecret: config.security.ipHashSecret,
        proxyDetectionService,
      },
    );

    const app = createApp({
      config,
      logger,
      inAppBrowserPolicyService,
      networkPostbackService,
      readinessCheck: async (): Promise<void> => {
        await database.checkHealth();
      },
      trackingLinkResolverService,
      trackingPreviewService,
    });
    const server = createServer(app);

    configureHttpServer(server);

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
  loadRootEnvironmentFile();
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
