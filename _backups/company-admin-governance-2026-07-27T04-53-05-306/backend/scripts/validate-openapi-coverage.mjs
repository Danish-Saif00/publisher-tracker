import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { createOpenApiDocument } from '../apps/api/dist/openapi.document.js';

const ROUTE_FILES = [
  'apps/api/src/billing-foundation.routes.ts',
  'apps/api/src/catalog-operations.routes.ts',
  'apps/api/src/company-management.routes.ts',
  'apps/api/src/conversion-postbacks.routes.ts',
  'apps/api/src/duplicate-fraud.routes.ts',
  'apps/api/src/final-operations.routes.ts',
  'apps/api/src/offers-payout.routes.ts',
  'apps/api/src/reporting-customization.routes.ts',
  'apps/api/src/tenant-administration.routes.ts',
  'apps/api/src/tracking-links.routes.ts',
  'apps/api/src/tracking-networks.routes.ts',
  'apps/tracker/src/network-postback.routes.ts',
];

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function normalizeRoutePath(routePath) {
  return routePath.replace(/:([A-Za-z0-9_]+)/gu, '{$1}');
}

const expectedOperations = [
  {
    method: 'get',
    path: '/auth/me',
  },
  {
    method: 'get',
    path: '/health',
  },
  {
    method: 'get',
    path: '/ready',
  },
  {
    method: 'get',
    path: '/r/{token}',
  },
];

for (const routeFile of ROUTE_FILES) {
  const source = await readFile(path.resolve(routeFile), 'utf8');

  for (const match of source.matchAll(
    /router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/gsu,
  )) {
    expectedOperations.push({
      method: match[1],
      path: normalizeRoutePath(match[2]),
    });
  }
}

const document = createOpenApiDocument('/api/v1');
const documentPaths = document.paths;

assertCondition(
  typeof documentPaths === 'object' && documentPaths !== null,
  'OpenAPI document does not expose a paths object.',
);

const missingOperations = [];

for (const operation of expectedOperations) {
  const pathDefinition = documentPaths[operation.path];

  if (
    typeof pathDefinition !== 'object' ||
    pathDefinition === null ||
    !(operation.method in pathDefinition)
  ) {
    missingOperations.push(`${operation.method.toUpperCase()} ${operation.path}`);
  }
}

assertCondition(
  missingOperations.length === 0,
  `OpenAPI coverage is incomplete: ${missingOperations.join(', ')}`,
);

const components = document.components;

assertCondition(
  typeof components === 'object' &&
    components !== null &&
    typeof components.securitySchemes === 'object' &&
    components.securitySchemes !== null &&
    'bearerAuth' in components.securitySchemes,
  'OpenAPI bearer authentication scheme is missing.',
);

const uniqueOperationKeys = new Set(
  expectedOperations.map((operation) => `${operation.method}:${operation.path}`),
);

assertCondition(
  uniqueOperationKeys.size === expectedOperations.length,
  'Duplicate route operation definitions were detected during OpenAPI validation.',
);

console.log(
  `OpenAPI coverage validation passed for ${expectedOperations.length} API and tracker operations.`,
);
console.log('BATCH 15 OPENAPI COVERAGE VALIDATION PASSED');
