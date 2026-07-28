import { createServer, type Server } from 'node:http';
import process from 'node:process';

import {
  createSupabaseAccessTokenVerifier,
  createSupabaseUserInvitationGateway,
} from '@affiliate-tracker/auth';
import { createDatabase, type DatabaseRuntime } from '@affiliate-tracker/database';
import {
  createLogger,
  serializeError,
  type ObservabilityLogger,
} from '@affiliate-tracker/observability';

import { createApp } from './app.js';
import { createBillingFoundationRepository } from './billing-foundation.repository.js';
import { createBillingFoundationService } from './billing-foundation.service.js';
import { createCatalogOperationsRepository } from './catalog-operations.repository.js';
import { createCatalogOperationsService } from './catalog-operations.service.js';
import { createCompanyManagementRepository } from './company-management.repository.js';
import { createCompanyManagementService } from './company-management.service.js';
import { createCompanyInvitationsRepository } from './company-invitations.repository.js';
import { createCompanyInvitationsService } from './company-invitations.service.js';
import { createEmailPayloadCipher } from './email-payload-cipher.js';
import { createInvitationEmailOutboxRepository } from './invitation-email-outbox.repository.js';
import { createCompanyMailTransport } from './company-mail.transport.js';
import { createCredentialCipher } from './credential-cipher.js';
import { createConversionPostbacksRepository } from './conversion-postbacks.repository.js';
import { createConversionPostbacksService } from './conversion-postbacks.service.js';
import { createCompanyOperationsRepository } from './reporting-customization.repository.js';
import { createCompanyOperationsService } from './reporting-customization.service.js';
import { createDuplicateFraudRepository } from './duplicate-fraud.repository.js';
import { createDuplicateFraudService } from './duplicate-fraud.service.js';
import { createOffersPayoutRepository } from './offers-payout.repository.js';
import { createOffersPayoutService } from './offers-payout.service.js';
import { createTrackingLinksRepository } from './tracking-links.repository.js';
import { createTrackingLinksService } from './tracking-links.service.js';
import { createTenantAdministrationRepository } from './tenant-administration.repository.js';
import { createTenantAdministrationService } from './tenant-administration.service.js';
import { createTrackingNetworksRepository } from './tracking-networks.repository.js';
import { createTrackingNetworksService } from './tracking-networks.service.js';
import { loadApiConfig } from './config.js';
import { createApiIdentityResolver } from './identity-resolver.js';

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
    service: 'api',
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
      'API database failed to close after a startup failure.',
    );
  }
}

function combineShutdownErrors(currentError: unknown, nextError: unknown): unknown {
  if (currentError === undefined) {
    return nextError;
  }

  return new AggregateError(
    [currentError, nextError],
    'Multiple API resources failed to close cleanly.',
  );
}

async function bootstrap(): Promise<void> {
  const config = loadApiConfig();

  const logger = createLogger({
    service: 'api',
    environment: config.application.environment,
    level: config.application.logLevel,
    pretty: config.application.prettyLogs,
  });

  const database = createDatabase({
    applicationName: 'affiliate-tracker-api',
    connectionString: config.database.connectionString,
    logger,
    minConnections: config.database.minConnections,
    maxConnections: config.database.maxConnections,
    queryTimeoutMs: config.database.queryTimeoutMs,
  });

  try {
    await database.checkHealth();

    logger.info('API database connection verified.');

    const tokenVerifier = createSupabaseAccessTokenVerifier({
      supabaseUrl: config.authentication.supabaseUrl,
      publishableKey: config.authentication.publishableKey,
    });

    const identityResolver = createApiIdentityResolver(database);

    const billingFoundationRepository = createBillingFoundationRepository(database);

    const billingFoundationService = createBillingFoundationService(billingFoundationRepository);

    const catalogOperationsRepository = createCatalogOperationsRepository(database);

    const catalogOperationsService = createCatalogOperationsService(catalogOperationsRepository);

    const companyManagementRepository = createCompanyManagementRepository(database);

    const companyManagementService = createCompanyManagementService(companyManagementRepository);

    const invitationGateway = createSupabaseUserInvitationGateway({
      supabaseUrl: config.authentication.supabaseUrl,
      secretKey: config.authentication.secretKey,
    });

    const companyInvitationsRepository = createCompanyInvitationsRepository(database);
    const invitationEmailOutboxRepository =
      createInvitationEmailOutboxRepository(database);
    const invitationEmailPayloadCipher =
      createEmailPayloadCipher(config.security.dataEncryptionKey);

    const companyInvitationsService = createCompanyInvitationsService(
      companyInvitationsRepository,
      invitationGateway,
      invitationEmailOutboxRepository,
      invitationEmailPayloadCipher,
      config.frontend.publicUrl,
    );

    const tenantAdministrationRepository = createTenantAdministrationRepository(database);

    const tenantAdministrationService = createTenantAdministrationService(
      tenantAdministrationRepository,
    );

    const trackingNetworksRepository = createTrackingNetworksRepository(database);

    const trackingNetworksService = createTrackingNetworksService(trackingNetworksRepository);

    const offersPayoutRepository = createOffersPayoutRepository(database);

    const offersPayoutService = createOffersPayoutService(offersPayoutRepository);

    const companyOperationsRepository = createCompanyOperationsRepository(database);
    const credentialCipher = createCredentialCipher(config.security.dataEncryptionKey);
    const companyMailTransport = createCompanyMailTransport();
    const companyOperationsService = createCompanyOperationsService(
      companyOperationsRepository,
      credentialCipher,
      companyMailTransport,
    );

    const conversionPostbacksRepository = createConversionPostbacksRepository(database);

    const conversionPostbacksService = createConversionPostbacksService(
      conversionPostbacksRepository,
    );

    const duplicateFraudRepository = createDuplicateFraudRepository(database);

    const duplicateFraudService = createDuplicateFraudService(duplicateFraudRepository);

    const trackingLinksRepository = createTrackingLinksRepository(database);

    const trackingLinksService = createTrackingLinksService(trackingLinksRepository);

    const app = createApp({
      config,
      logger,
      readinessCheck: async (): Promise<void> => {
        await database.checkHealth();
      },
      tokenVerifier,
      identityResolver,
      billingFoundationService,
      catalogOperationsService,
      companyManagementService,
      companyInvitationsService,
      conversionPostbacksService,
      companyOperationsService,
      duplicateFraudService,
      offersPayoutService,
      trackingLinksService,
      tenantAdministrationService,
      trackingNetworksService,
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
        'API shutdown started.',
      );

      const forcedShutdownTimer = setTimeout(() => {
        logger.error(
          {
            timeoutMs: SHUTDOWN_TIMEOUT_MS,
          },
          'API graceful shutdown timed out.',
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
          'API resources failed to close cleanly.',
        );

        process.exitCode = 1;
        return;
      }

      logger.info('API shutdown completed.');
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
        'API server encountered an error.',
      );

      process.exitCode = 1;
    });

    logger.info(
      {
        host: config.server.host,
        port: config.server.port,
        basePath: config.server.basePath,
      },
      'API server started.',
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
    'API failed to start.',
  );

  process.exitCode = 1;
}
