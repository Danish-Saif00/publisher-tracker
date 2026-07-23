import { readFile } from 'node:fs/promises';

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readRequiredFile(filePath) {
  const content = await readFile(filePath, 'utf8');

  assertCondition(content.trim().length > 0, `Required file is empty: ${filePath}`);

  return content;
}

const apiApp = await readRequiredFile('apps/api/src/app.ts');
const apiMain = await readRequiredFile('apps/api/src/main.ts');
const apiHardening = await readRequiredFile('apps/api/src/http-hardening.middleware.ts');
const trackerApp = await readRequiredFile('apps/tracker/src/app.ts');
const trackerMain = await readRequiredFile('apps/tracker/src/main.ts');
const trackerHardening = await readRequiredFile('apps/tracker/src/http-hardening.middleware.ts');
const trackerRequestId = await readRequiredFile('apps/tracker/src/request-id.middleware.ts');
const environmentExample = await readRequiredFile('.env.example');
const gitIgnore = await readRequiredFile('.gitignore');
const gitAttributes = await readRequiredFile('.gitattributes');

for (const marker of [
  'createApiSecurityHeadersMiddleware',
  'createApiCorsMiddleware',
  'createApiRateLimitMiddleware',
  "app.get('/ready'",
  'readBodyParserFailure',
  'DatabaseError',
]) {
  assertCondition(apiApp.includes(marker), `API hardening marker is missing: ${marker}`);
}

for (const marker of [
  'content-security-policy',
  'strict-transport-security',
  'CORS_ORIGIN_DENIED',
  'RATE_LIMIT_EXCEEDED',
  'access-control-allow-origin',
  'retry-after',
]) {
  assertCondition(apiHardening.includes(marker), `API HTTP security marker is missing: ${marker}`);
}

for (const marker of [
  'trackerRequestIdMiddleware',
  'createTrackerSecurityHeadersMiddleware',
  'createTrackerRateLimitMiddleware',
  "app.get('/ready'",
  'readBodyParserFailure',
]) {
  assertCondition(trackerApp.includes(marker), `Tracker hardening marker is missing: ${marker}`);
}

for (const marker of [
  'content-security-policy',
  'strict-transport-security',
  'TRACKER_RATE_LIMIT_EXCEEDED',
  'retry-after',
]) {
  assertCondition(
    trackerHardening.includes(marker),
    `Tracker HTTP security marker is missing: ${marker}`,
  );
}

for (const marker of ['randomUUID', 'x-request-id', 'RESPONSE_REQUEST_IDS']) {
  assertCondition(
    trackerRequestId.includes(marker),
    `Tracker request-ID marker is missing: ${marker}`,
  );
}

for (const source of [apiMain, trackerMain]) {
  for (const marker of [
    'server.requestTimeout',
    'server.headersTimeout',
    'server.keepAliveTimeout',
    'server.maxHeadersCount',
    'readinessCheck:',
  ]) {
    assertCondition(source.includes(marker), `HTTP server hardening marker is missing: ${marker}`);
  }
}

for (const marker of [
  'DATA_ENCRYPTION_KEY=replace_with_a_base64_encoded_32_byte_key',
  'IP_HASH_SECRET=replace_with_at_least_32_random_characters',
  'VISITOR_ID_SIGNING_SECRET=replace_with_at_least_32_random_characters',
]) {
  assertCondition(
    environmentExample.includes(marker),
    `Environment secret placeholder is missing: ${marker}`,
  );
}

for (const marker of [
  'affiliate-tracker-batch-*.ps1',
  'batch-*-context.txt',
  'backend-production-readiness-report.json',
]) {
  assertCondition(gitIgnore.includes(marker), `.gitignore marker is missing: ${marker}`);
}

assertCondition(
  gitAttributes.includes('* text=auto eol=lf'),
  '.gitattributes does not enforce LF line endings.',
);

console.log(
  'Security baseline validation passed for API and tracker headers, CORS, rate limiting, readiness, request IDs, server timeouts, secret placeholders, and repository hygiene.',
);
console.log('BATCH 15 SECURITY BASELINE VALIDATION PASSED');
