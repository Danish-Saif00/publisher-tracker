import express from 'express';
import type { ErrorRequestHandler, Express, RequestHandler } from 'express';

import type { TrackerRuntimeConfig } from './config.js';

interface TrackerErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

function createErrorResponse(code: string, message: string): TrackerErrorResponse {
  return {
    error: {
      code,
      message,
    },
  };
}

const healthCheckHandler: RequestHandler = (_request, response): void => {
  response.status(200).json({
    status: 'ok',
    service: 'tracker',
    timestamp: new Date().toISOString(),
  });
};

const notFoundHandler: RequestHandler = (_request, response): void => {
  response
    .status(404)
    .json(createErrorResponse('TRACKING_ROUTE_NOT_FOUND', 'The tracking route was not found.'));
};

const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next): void => {
  if (response.headersSent) {
    next(error);
    return;
  }

  response
    .status(500)
    .json(createErrorResponse('TRACKER_INTERNAL_ERROR', 'An unexpected error occurred.'));
};

export function createApp(config: TrackerRuntimeConfig): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.server.trustProxy);

  app.use(
    express.json({
      limit: config.server.requestBodyLimit,
    }),
  );

  app.use(
    express.urlencoded({
      extended: false,
      limit: config.server.requestBodyLimit,
    }),
  );

  app.get('/health', healthCheckHandler);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
