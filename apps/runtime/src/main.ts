// apps/runtime/src/main.ts
import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import {
  createServer,
  request as createHttpRequest,
  type IncomingHttpHeaders,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type Server,
  type ServerResponse,
} from 'node:http';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { loadRootEnvironmentFile } from '@affiliate-tracker/config';
import {
  createLogger,
  serializeError,
  type ObservabilityLogger,
} from '@affiliate-tracker/observability';

const DEFAULT_PUBLIC_HOST = '0.0.0.0';
const DEFAULT_PUBLIC_PORT = 10_000;
const DEFAULT_API_INTERNAL_PORT = 4_001;
const DEFAULT_TRACKER_INTERNAL_PORT = 4_101;
const DEFAULT_STARTUP_TIMEOUT_MS = 90_000;
const DEFAULT_PROXY_TIMEOUT_MS = 30_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 15_000;
const CHILD_OUTPUT_BUFFER_LIMIT = 64_000;
const HEALTH_PROBE_INTERVAL_MS = 250;
const HEALTH_PROBE_TIMEOUT_MS = 2_000;

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

type RuntimeEnvironment = 'development' | 'production' | 'test';
type RuntimeLogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
type ChildServiceName = 'api' | 'tracker' | 'worker';
type ProxyTarget = 'api' | 'tracker';
type RuntimeChildProcess = ChildProcessByStdio<null, Readable, Readable>;

interface RuntimeConfig {
  readonly environment: RuntimeEnvironment;
  readonly publicHost: string;
  readonly publicPort: number;
  readonly apiInternalPort: number;
  readonly trackerInternalPort: number;
  readonly startupTimeoutMs: number;
  readonly proxyTimeoutMs: number;
  readonly shutdownTimeoutMs: number;
  readonly apiBasePath: string;
  readonly swaggerPath: string;
  readonly openApiJsonPath: string;
  readonly trackingHosts: ReadonlySet<string>;
}

interface ManagedChild {
  readonly name: ChildServiceName;
  readonly process: RuntimeChildProcess;
  recentOutput: string;
}

interface RuntimeChildren {
  readonly api: ManagedChild;
  readonly tracker: ManagedChild;
  readonly worker: ManagedChild;
}

interface ReadinessResult {
  readonly apiReady: boolean;
  readonly trackerReady: boolean;
  readonly workerReady: boolean;
}

function readString(name: string, fallback: string): string {
  const value = process.env[name]?.trim();

  return value === undefined || value.length === 0 ? fallback : value;
}

function readInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const rawValue = process.env[name]?.trim();

  if (rawValue === undefined || rawValue.length === 0) {
    return fallback;
  }

  if (!/^\d+$/u.test(rawValue)) {
    throw new Error(`${name} must be a whole number.`);
  }

  const value = Number(rawValue);

  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${String(minimum)} and ${String(maximum)}.`);
  }

  return value;
}

function normalizeApplicationPath(value: string): string {
  const trimmedValue = value.trim();

  if (!trimmedValue.startsWith('/')) {
    throw new Error(`Application path must start with "/": ${value}`);
  }

  if (trimmedValue.length > 1 && trimmedValue.endsWith('/')) {
    return trimmedValue.slice(0, -1);
  }

  return trimmedValue;
}

function normalizeHostname(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const withoutPort = value.trim().toLowerCase().replace(/:\d+$/u, '');

  return withoutPort.length === 0 ? undefined : withoutPort;
}

function readEnvironment(): RuntimeEnvironment {
  const value = (process.env['APP_ENV'] ?? process.env['NODE_ENV'] ?? 'production').trim();

  switch (value) {
    case 'development':
    case 'production':
    case 'test':
      return value;
    default:
      throw new Error('APP_ENV must be development, test, or production.');
  }
}

function readLogLevel(): RuntimeLogLevel {
  const value = readString('LOG_LEVEL', 'info');

  switch (value) {
    case 'fatal':
    case 'error':
    case 'warn':
    case 'info':
    case 'debug':
    case 'trace':
    case 'silent':
      return value;
    default:
      throw new Error('LOG_LEVEL must be fatal, error, warn, info, debug, trace, or silent.');
  }
}

function createRuntimeConfig(): RuntimeConfig {
  const publicPort = readInteger('PORT', DEFAULT_PUBLIC_PORT, 1, 65_535);
  const apiInternalPort = readInteger(
    'RUNTIME_API_INTERNAL_PORT',
    DEFAULT_API_INTERNAL_PORT,
    1,
    65_535,
  );
  const trackerInternalPort = readInteger(
    'RUNTIME_TRACKER_INTERNAL_PORT',
    DEFAULT_TRACKER_INTERNAL_PORT,
    1,
    65_535,
  );

  if (
    publicPort === apiInternalPort ||
    publicPort === trackerInternalPort ||
    apiInternalPort === trackerInternalPort
  ) {
    throw new Error(
      'PORT, RUNTIME_API_INTERNAL_PORT, and RUNTIME_TRACKER_INTERNAL_PORT must be different.',
    );
  }

  const trackingHosts = new Set<string>();

  for (const candidate of [
    process.env['TRACKING_ROOT_DOMAIN'],
    process.env['POSTBACK_ROOT_DOMAIN'],
  ]) {
    const normalizedHost = normalizeHostname(candidate);

    if (normalizedHost !== undefined) {
      trackingHosts.add(normalizedHost);
    }
  }

  return Object.freeze({
    environment: readEnvironment(),
    publicHost: readString('RUNTIME_HOST', DEFAULT_PUBLIC_HOST),
    publicPort,
    apiInternalPort,
    trackerInternalPort,
    startupTimeoutMs: readInteger(
      'RUNTIME_STARTUP_TIMEOUT_MS',
      DEFAULT_STARTUP_TIMEOUT_MS,
      5_000,
      300_000,
    ),
    proxyTimeoutMs: readInteger(
      'RUNTIME_PROXY_TIMEOUT_MS',
      DEFAULT_PROXY_TIMEOUT_MS,
      1_000,
      300_000,
    ),
    shutdownTimeoutMs: readInteger(
      'RUNTIME_SHUTDOWN_TIMEOUT_MS',
      DEFAULT_SHUTDOWN_TIMEOUT_MS,
      1_000,
      60_000,
    ),
    apiBasePath: normalizeApplicationPath(readString('API_BASE_PATH', '/api/v1')),
    swaggerPath: normalizeApplicationPath(readString('SWAGGER_PATH', '/docs')),
    openApiJsonPath: normalizeApplicationPath(readString('OPENAPI_JSON_PATH', '/openapi.json')),
    trackingHosts,
  });
}

function createFallbackLogger(): ObservabilityLogger {
  return createLogger({
    service: 'runtime',
    environment: 'development',
    level: 'error',
    pretty: false,
    baseBindings: {
      loggerMode: 'startup-fallback',
    },
  });
}

function workspaceRoot(): string {
  const runtimeDirectory = dirname(fileURLToPath(import.meta.url));

  return resolve(runtimeDirectory, '../../..');
}

function serviceEntryPath(rootDirectory: string, serviceName: ChildServiceName): string {
  return resolve(rootDirectory, 'apps', serviceName, 'dist', 'main.js');
}

function appendRecentOutput(child: ManagedChild, chunk: Buffer): void {
  child.recentOutput += chunk.toString('utf8');

  if (child.recentOutput.length > CHILD_OUTPUT_BUFFER_LIMIT) {
    child.recentOutput = child.recentOutput.slice(-CHILD_OUTPUT_BUFFER_LIMIT);
  }
}

function createChildEnvironment(
  config: RuntimeConfig,
  overrides: Readonly<Record<string, string>>,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    APP_ENV: config.environment,
    NODE_ENV: config.environment,
    LOG_PRETTY:
      process.env['LOG_PRETTY'] ?? (config.environment === 'production' ? 'false' : 'true'),
    ...overrides,
  };
}

function spawnChild(
  rootDirectory: string,
  name: ChildServiceName,
  environment: NodeJS.ProcessEnv,
  logger: ObservabilityLogger,
): ManagedChild {
  const entryPath = serviceEntryPath(rootDirectory, name);

  if (!existsSync(entryPath)) {
    throw new Error(`Built ${name} entrypoint was not found: ${entryPath}`);
  }

  const childProcess = spawn(process.execPath, ['--enable-source-maps', entryPath], {
    cwd: rootDirectory,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const child: ManagedChild = {
    name,
    process: childProcess,
    recentOutput: '',
  };

  childProcess.stdout.on('data', (chunk: Buffer) => {
    appendRecentOutput(child, chunk);
    process.stdout.write(chunk);
  });

  childProcess.stderr.on('data', (chunk: Buffer) => {
    appendRecentOutput(child, chunk);
    process.stderr.write(chunk);
  });

  childProcess.once('spawn', () => {
    logger.info(
      {
        childService: name,
        processId: childProcess.pid,
      },
      'Child runtime spawned.',
    );
  });

  return child;
}

function childIsRunning(child: ManagedChild): boolean {
  return child.process.exitCode === null && child.process.signalCode === null;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, milliseconds);
  });
}

function probeHttpStatus(port: number, path: string): Promise<number> {
  return new Promise((resolveProbe, rejectProbe) => {
    const request = createHttpRequest(
      {
        host: '127.0.0.1',
        port,
        path,
        method: 'GET',
        headers: {
          host: 'runtime.internal',
          connection: 'close',
        },
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;

        response.resume();
        response.once('end', () => {
          resolveProbe(statusCode);
        });
      },
    );

    request.setTimeout(HEALTH_PROBE_TIMEOUT_MS, () => {
      request.destroy(new Error(`Readiness probe timed out for 127.0.0.1:${String(port)}${path}.`));
    });

    request.once('error', rejectProbe);
    request.end();
  });
}

async function waitForHttpReadiness(
  child: ManagedChild,
  port: number,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!childIsRunning(child)) {
      throw new Error(`${child.name} exited before becoming ready.`);
    }

    try {
      const statusCode = await probeHttpStatus(port, '/ready');

      if (statusCode >= 200 && statusCode < 300) {
        return;
      }
    } catch {
      // The child can legitimately refuse connections while booting.
    }

    await delay(HEALTH_PROBE_INTERVAL_MS);
  }

  throw new Error(`${child.name} did not become ready within ${String(timeoutMs)}ms.`);
}

async function waitForWorkerReadiness(child: ManagedChild, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const readinessMessages = [
    'Worker runtime started.',
    'BullMQ workers and email dispatcher are ready.',
  ];

  while (Date.now() < deadline) {
    if (!childIsRunning(child)) {
      throw new Error('worker exited before becoming ready.');
    }

    if (readinessMessages.some((message) => child.recentOutput.includes(message))) {
      return;
    }

    await delay(HEALTH_PROBE_INTERVAL_MS);
  }

  throw new Error(`worker did not become ready within ${String(timeoutMs)}ms.`);
}

async function readReadiness(
  children: RuntimeChildren,
  config: RuntimeConfig,
): Promise<ReadinessResult> {
  const [apiResult, trackerResult] = await Promise.allSettled([
    probeHttpStatus(config.apiInternalPort, '/ready'),
    probeHttpStatus(config.trackerInternalPort, '/ready'),
  ]);

  return {
    apiReady:
      apiResult.status === 'fulfilled' &&
      apiResult.value >= 200 &&
      apiResult.value < 300 &&
      childIsRunning(children.api),
    trackerReady:
      trackerResult.status === 'fulfilled' &&
      trackerResult.value >= 200 &&
      trackerResult.value < 300 &&
      childIsRunning(children.tracker),
    workerReady: childIsRunning(children.worker),
  };
}

function requestPath(request: IncomingMessage): {
  readonly pathname: string;
  readonly searchParams: URLSearchParams;
} {
  const parsedUrl = new URL(request.url ?? '/', 'http://runtime.internal');

  return {
    pathname: parsedUrl.pathname,
    searchParams: parsedUrl.searchParams,
  };
}

function pathMatchesBase(pathname: string, basePath: string): boolean {
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

function selectProxyTarget(request: IncomingMessage, config: RuntimeConfig): ProxyTarget {
  const { pathname, searchParams } = requestPath(request);

  if (
    pathMatchesBase(pathname, config.apiBasePath) ||
    pathMatchesBase(pathname, config.swaggerPath) ||
    pathname === config.openApiJsonPath
  ) {
    return 'api';
  }

  if (
    pathMatchesBase(pathname, '/postbacks') ||
    pathMatchesBase(pathname, '/r') ||
    pathname.startsWith('/pub_id=')
  ) {
    return 'tracker';
  }

  if (pathname === '/' && searchParams.has('pub_id') && searchParams.has('offer_id')) {
    return 'tracker';
  }

  const requestHost = normalizeHostname(request.headers.host);

  if (requestHost !== undefined && config.trackingHosts.has(requestHost)) {
    return 'tracker';
  }

  return 'api';
}

function firstHeaderValue(value: string | readonly string[] | undefined): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  return value?.[0];
}

function createProxyHeaders(request: IncomingMessage): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = {
    ...request.headers,
  };

  for (const headerName of HOP_BY_HOP_HEADERS) {
    Reflect.deleteProperty(headers, headerName);
  }

  const forwardedFor =
    firstHeaderValue(request.headers['x-forwarded-for']) ??
    request.socket.remoteAddress ??
    'unknown';
  const forwardedHost =
    firstHeaderValue(request.headers['x-forwarded-host']) ?? request.headers.host ?? 'unknown';
  const forwardedProto = firstHeaderValue(request.headers['x-forwarded-proto']) ?? 'http';

  headers['x-forwarded-for'] = forwardedFor;
  headers['x-forwarded-host'] = forwardedHost;
  headers['x-forwarded-proto'] = forwardedProto;

  if (request.headers.host !== undefined) {
    headers.host = request.headers.host;
  }

  return headers;
}

function copyResponseHeaders(sourceHeaders: IncomingHttpHeaders, response: ServerResponse): void {
  for (const [name, value] of Object.entries(sourceHeaders)) {
    if (value === undefined || HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
      continue;
    }

    response.setHeader(name, value);
  }
}

function writeJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  const body = JSON.stringify(payload);

  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('content-length', Buffer.byteLength(body));
  response.setHeader('cache-control', 'no-store, max-age=0');
  response.end(body);
}

function proxyRequest(
  request: IncomingMessage,
  response: ServerResponse,
  target: ProxyTarget,
  config: RuntimeConfig,
  logger: ObservabilityLogger,
): void {
  const port = target === 'api' ? config.apiInternalPort : config.trackerInternalPort;

  const upstreamRequest = createHttpRequest(
    {
      host: '127.0.0.1',
      port,
      method: request.method,
      path: request.url ?? '/',
      headers: createProxyHeaders(request),
    },
    (upstreamResponse) => {
      response.statusCode = upstreamResponse.statusCode ?? 502;

      if (upstreamResponse.statusMessage !== undefined) {
        response.statusMessage = upstreamResponse.statusMessage;
      }

      copyResponseHeaders(upstreamResponse.headers, response);
      upstreamResponse.pipe(response);
    },
  );

  upstreamRequest.setTimeout(config.proxyTimeoutMs, () => {
    upstreamRequest.destroy(
      new Error(`${target} proxy request exceeded ${String(config.proxyTimeoutMs)}ms.`),
    );
  });

  upstreamRequest.once('error', (error) => {
    logger.error(
      {
        target,
        requestMethod: request.method,
        requestUrl: request.url,
        error: serializeError(error),
      },
      'Runtime proxy request failed.',
    );

    if (!response.headersSent) {
      writeJson(response, 502, {
        error: {
          code: 'RUNTIME_UPSTREAM_UNAVAILABLE',
          message: `${target} is unavailable.`,
          requestId: randomUUID(),
        },
      });
      return;
    }

    response.destroy(error);
  });

  request.once('aborted', () => {
    upstreamRequest.destroy(new Error('Client aborted the proxied request.'));
  });

  request.pipe(upstreamRequest);
}

async function handleAggregateHealth(
  request: IncomingMessage,
  response: ServerResponse,
  children: RuntimeChildren,
  config: RuntimeConfig,
): Promise<boolean> {
  const { pathname } = requestPath(request);

  if (
    pathname !== '/health' &&
    pathname !== '/ready' &&
    pathname !== '/runtime/health' &&
    pathname !== '/runtime/ready'
  ) {
    return false;
  }

  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('access-control-allow-methods', 'GET, HEAD, OPTIONS');
  response.setHeader('access-control-allow-headers', 'accept, content-type');

  const requestId = randomUUID();
  const isReadiness = pathname === '/ready' || pathname === '/runtime/ready';

  if (!isReadiness) {
    const services = {
      api: childIsRunning(children.api) ? 'running' : 'stopped',
      tracker: childIsRunning(children.tracker) ? 'running' : 'stopped',
      worker: childIsRunning(children.worker) ? 'running' : 'stopped',
    };
    const healthy = Object.values(services).every((status) => status === 'running');

    writeJson(response, healthy ? 200 : 503, {
      status: healthy ? 'ok' : 'degraded',
      service: 'runtime',
      services,
      requestId,
      timestamp: new Date().toISOString(),
    });

    return true;
  }

  const readiness = await readReadiness(children, config);
  const ready = readiness.apiReady && readiness.trackerReady && readiness.workerReady;

  writeJson(response, ready ? 200 : 503, {
    status: ready ? 'ready' : 'not_ready',
    service: 'runtime',
    services: {
      api: readiness.apiReady ? 'ready' : 'not_ready',
      tracker: readiness.trackerReady ? 'ready' : 'not_ready',
      worker: readiness.workerReady ? 'ready' : 'not_ready',
    },
    requestId,
    timestamp: new Date().toISOString(),
  });

  return true;
}

function configurePublicServer(server: Server): void {
  server.requestTimeout = 35_000;
  server.headersTimeout = 40_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
}

function startPublicServer(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolveStart, rejectStart) => {
    const handleError = (error: Error): void => {
      server.off('listening', handleListening);
      rejectStart(error);
    };

    const handleListening = (): void => {
      server.off('error', handleError);
      resolveStart();
    };

    server.once('error', handleError);
    server.once('listening', handleListening);
    server.listen(port, host);
  });
}

function closePublicServer(server: Server): Promise<void> {
  return new Promise((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error !== undefined) {
        rejectClose(error);
        return;
      }

      resolveClose();
    });
  });
}

async function terminateChild(child: ManagedChild, timeoutMs: number): Promise<void> {
  if (!childIsRunning(child)) {
    return;
  }

  child.process.kill('SIGTERM');

  const exitPromise = once(child.process, 'exit').then(() => undefined);
  const timeoutPromise = delay(timeoutMs).then(() => {
    if (childIsRunning(child)) {
      child.process.kill('SIGKILL');
    }
  });

  await Promise.race([exitPromise, timeoutPromise]);

  if (childIsRunning(child)) {
    child.process.kill('SIGKILL');
    await once(child.process, 'exit');
  }
}

async function terminateChildren(
  children: readonly ManagedChild[],
  timeoutMs: number,
): Promise<void> {
  await Promise.allSettled(
    children.map(async (child) => {
      await terminateChild(child, timeoutMs);
    }),
  );
}

async function bootstrap(): Promise<void> {
  loadRootEnvironmentFile();

  const config = createRuntimeConfig();
  const logger = createLogger({
    service: 'runtime',
    environment: config.environment,
    level: readLogLevel(),
    pretty:
      (process.env['LOG_PRETTY'] ?? (config.environment === 'production' ? 'false' : 'true')) ===
      'true',
  });
  const rootDirectory = workspaceRoot();

  logger.info(
    {
      publicHost: config.publicHost,
      publicPort: config.publicPort,
      apiInternalPort: config.apiInternalPort,
      trackerInternalPort: config.trackerInternalPort,
      apiBasePath: config.apiBasePath,
      swaggerPath: config.swaggerPath,
      openApiJsonPath: config.openApiJsonPath,
    },
    'Single-service runtime startup initiated.',
  );

  const api = spawnChild(
    rootDirectory,
    'api',
    createChildEnvironment(config, {
      API_HOST: '127.0.0.1',
      API_PORT: String(config.apiInternalPort),
      TRUST_PROXY: 'true',
    }),
    logger,
  );
  const tracker = spawnChild(
    rootDirectory,
    'tracker',
    createChildEnvironment(config, {
      TRACKER_HOST: '127.0.0.1',
      TRACKER_PORT: String(config.trackerInternalPort),
      TRUST_PROXY: 'true',
    }),
    logger,
  );
  const worker = spawnChild(rootDirectory, 'worker', createChildEnvironment(config, {}), logger);
  const children: RuntimeChildren = {
    api,
    tracker,
    worker,
  };
  const childList = [api, tracker, worker] as const;

  let publicServer: Server | undefined;
  let shutdownStarted = false;
  let startupCompleted = false;

  const shutdown = async (reason: string, exitCode: number): Promise<void> => {
    if (shutdownStarted) {
      return;
    }

    shutdownStarted = true;

    logger.info(
      {
        reason,
        exitCode,
      },
      'Single-service runtime shutdown started.',
    );

    let shutdownError: unknown;

    if (publicServer !== undefined) {
      try {
        await closePublicServer(publicServer);
      } catch (error: unknown) {
        shutdownError = error;
        publicServer.closeAllConnections();
      }
    }

    const terminationResults = await Promise.allSettled(
      childList.map(async (child) => {
        await terminateChild(child, config.shutdownTimeoutMs);
      }),
    );

    for (const result of terminationResults) {
      if (result.status === 'rejected') {
        shutdownError =
          shutdownError === undefined
            ? result.reason
            : new AggregateError(
                [shutdownError, result.reason],
                'Multiple runtime resources failed to close.',
              );
      }
    }

    if (shutdownError !== undefined) {
      logger.error(
        {
          error: serializeError(shutdownError),
        },
        'Single-service runtime shutdown completed with errors.',
      );
      process.exitCode = 1;
      return;
    }

    logger.info('Single-service runtime shutdown completed.');
    process.exitCode = exitCode;
  };

  for (const child of childList) {
    child.process.once('exit', (code, signal) => {
      const exitDetails = {
        childService: child.name,
        exitCode: code,
        signal,
        startupCompleted,
      };

      if (shutdownStarted) {
        logger.info(exitDetails, 'Child runtime exited during shutdown.');
        return;
      }

      logger.error(exitDetails, 'Child runtime exited unexpectedly.');

      void shutdown(`${child.name}-exit`, code === 0 && startupCompleted ? 1 : (code ?? 1));
    });

    child.process.once('error', (error) => {
      logger.error(
        {
          childService: child.name,
          error: serializeError(error),
        },
        'Child runtime process error.',
      );

      if (!shutdownStarted) {
        void shutdown(`${child.name}-process-error`, 1);
      }
    });
  }

  process.once('SIGINT', () => {
    void shutdown('SIGINT', 0);
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM', 0);
  });

  try {
    await Promise.all([
      waitForHttpReadiness(api, config.apiInternalPort, config.startupTimeoutMs),
      waitForHttpReadiness(tracker, config.trackerInternalPort, config.startupTimeoutMs),
      waitForWorkerReadiness(worker, config.startupTimeoutMs),
    ]);

    publicServer = createServer((request, response) => {
      void (async () => {
        if (await handleAggregateHealth(request, response, children, config)) {
          return;
        }

        const target = selectProxyTarget(request, config);

        proxyRequest(request, response, target, config, logger);
      })().catch((error: unknown) => {
        logger.error(
          {
            requestMethod: request.method,
            requestUrl: request.url,
            error: serializeError(error),
          },
          'Unhandled public gateway request failure.',
        );

        if (!response.headersSent) {
          writeJson(response, 500, {
            error: {
              code: 'RUNTIME_INTERNAL_ERROR',
              message: 'The runtime could not process the request.',
              requestId: randomUUID(),
            },
          });
          return;
        }

        response.destroy(
          error instanceof Error ? error : new Error('Unknown runtime request failure.'),
        );
      });
    });

    configurePublicServer(publicServer);

    publicServer.on('clientError', (error, socket) => {
      logger.warn(
        {
          error: serializeError(error),
        },
        'Runtime client connection error.',
      );

      if (socket.writable) {
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      }
    });

    publicServer.on('error', (error) => {
      logger.error(
        {
          error: serializeError(error),
        },
        'Public runtime server error.',
      );

      if (!shutdownStarted) {
        void shutdown('public-server-error', 1);
      }
    });

    await startPublicServer(publicServer, config.publicHost, config.publicPort);

    startupCompleted = true;

    logger.info(
      {
        host: config.publicHost,
        port: config.publicPort,
        apiBasePath: config.apiBasePath,
        swaggerPath: config.swaggerPath,
        workerProcessId: worker.process.pid,
        apiProcessId: api.process.pid,
        trackerProcessId: tracker.process.pid,
      },
      'Single-service runtime started.',
    );
  } catch (error: unknown) {
    logger.error(
      {
        error: serializeError(error),
      },
      'Single-service runtime startup failed.',
    );

    await terminateChildren(childList, config.shutdownTimeoutMs);

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
    'Single-service runtime failed to start.',
  );

  process.exitCode = 1;
}
