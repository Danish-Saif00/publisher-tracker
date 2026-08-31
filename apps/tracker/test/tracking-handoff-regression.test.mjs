import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { createApp } from '../dist/app.js';
import { createTrackingHandoffContinuationUrl } from '../dist/tracking-handoff-continuation.js';
const TEST_SIGNING_SECRET = 'tracker-handoff-regression-secret-123456789';
const BROWSER_HEADERS = {
  'user-agent': 'Mozilla/5.0 Chrome/151.0 Safari/537.36',
};
function createConfig() {
  return {
    application: {
      environment: 'development',
      logLevel: 'info',
      prettyLogs: false,
    },
    server: {
      host: '127.0.0.1',
      port: 0,
      trustProxy: false,
      requestBodyLimit: '1mb',
    },
    rateLimit: {
      windowMs: 60_000,
      maxRequests: 10_000,
    },
    database: {
      connectionString: 'postgresql://unused',
      minConnections: 0,
      maxConnections: 1,
      queryTimeoutMs: 1_000,
    },
    security: {
      dataEncryptionKey: 'unused-test-key',
      ipHashSecret: 'unused-test-ip-secret',
      visitorIdSigningSecret: TEST_SIGNING_SECRET,
    },
    tracking: {
      cookieName: 'tracker_test',
      cookieMaxAgeDays: 30,
      secureCookies: false,
    },
  };
}
function createRedirectResult() {
  return {
    trackingClickId: 'tracking-click-1',
    publicClickId: `clk_${'a'.repeat(32)}`,
    trackingLinkId: 'tracking-link-1',
    visitorId: 'visitor-1',
    duplicateDecision: 'accepted',
    fraudRiskLevel: 'low',
    fraudSignals: [],
    attributionEligible: true,
    blocked: false,
    blockReason: null,
    device: 'desktop',
    countryCode: 'PK',
    scheduleTimezone: 'UTC',
    scheduleLocalDay: 1,
    scheduleLocalTime: '12:00',
    proxyDetectionOutcome: 'not_checked',
    location: 'https://network.example/offer',
    setCookieHeader: null,
  };
}
async function startHarness(
  preflightResult = {
    detectedBrowser: null,
    blocked: false,
    offerName: null,
  },
) {
  const resolverInputs = [];
  let previewCalls = 0;
  let preflightCalls = 0;
  const app = createApp({
    config: createConfig(),
    logger: {
      error: () => undefined,
      warn: () => undefined,
    },
    inAppBrowserPolicyService: {
      async evaluatePublicRequest() {
        preflightCalls += 1;
        return preflightResult;
      },
      async evaluateReferenceRequest() {
        preflightCalls += 1;
        return preflightResult;
      },
    },
    networkPostbackService: {
      async ingest() {
        throw new Error('Network postback service should not be called by these tests.');
      },
    },
    readinessCheck: async () => undefined,
    trackingLinkResolverService: {
      async resolveRedirect(input) {
        resolverInputs.push(input);
        return createRedirectResult();
      },
    },
    trackingPreviewService: {
      async resolvePublicPreview() {
        previewCalls += 1;
        return {
          title: 'Preview Title',
          imageUrl: 'https://cdn.example/preview.png',
        };
      },
      async resolveReferencePreview() {
        previewCalls += 1;
        return {
          title: 'Preview Title',
          imageUrl: 'https://cdn.example/preview.png',
        };
      },
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address !== null && typeof address !== 'string');
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    resolverInputs,
    getPreviewCalls: () => previewCalls,
    getPreflightCalls: () => preflightCalls,
    async close() {
      if (!server.listening) {
        return;
      }
      server.close();
      await once(server, 'close');
    },
  };
}
test('unsigned public tracking URL resolves directly in a standalone browser', async (context) => {
  const harness = await startHarness();
  context.after(() => harness.close());
  const response = await fetch(`${harness.baseUrl}/r/test-token?source=snapchat`, {
    headers: BROWSER_HEADERS,
    redirect: 'manual',
  });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://network.example/offer');
  assert.equal(harness.resolverInputs.length, 1);
  assert.equal(harness.getPreviewCalls(), 0);
  assert.equal(harness.getPreflightCalls(), 1);
  const resolverQuery = harness.resolverInputs[0].query;
  assert.equal(typeof resolverQuery, 'object');
  assert.ok(resolverQuery !== null);
  assert.equal(resolverQuery.source, 'snapchat');
  assert.equal('__tracker_handoff' in resolverQuery, false);
});
test('blocked in-app browser returns instruction-only handoff before resolver', async (context) => {
  const harness = await startHarness({
    detectedBrowser: 'snapchat',
    blocked: true,
    offerName: 'Survey Junkie - DOI',
  });
  context.after(() => harness.close());
  const response = await fetch(`${harness.baseUrl}/r/test-token?source=snapchat`, {
    headers: {
      'user-agent': 'Mozilla/5.0 Snapchat/13.0',
    },
    redirect: 'manual',
  });
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(body, /copy the original tracking link/iu);
  assert.match(body, /Go back to the chat/iu);
  assert.doesNotMatch(body, /Copy Link/u);
  assert.doesNotMatch(body, /__tracker_handoff=/u);
  assert.equal(harness.resolverInputs.length, 0);
  assert.equal(harness.getPreviewCalls(), 0);
  assert.equal(harness.getPreflightCalls(), 1);
});
test('legacy signed continuation resolves directly and strips the internal token', async (context) => {
  const harness = await startHarness();
  context.after(() => harness.close());
  const canonicalUrl = `${harness.baseUrl}/r/test-token?source=snapchat`;
  const signedUrl = createTrackingHandoffContinuationUrl(
    canonicalUrl,
    TEST_SIGNING_SECRET,
  );
  const response = await fetch(signedUrl, {
    headers: BROWSER_HEADERS,
    redirect: 'manual',
  });
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://network.example/offer');
  assert.equal(harness.resolverInputs.length, 1);
  const resolverQuery = harness.resolverInputs[0].query;
  assert.equal(typeof resolverQuery, 'object');
  assert.ok(resolverQuery !== null);
  assert.equal(resolverQuery.source, 'snapchat');
  assert.equal('__tracker_handoff' in resolverQuery, false);
});
test('blocked in-app browser still handoffs when a legacy continuation is present', async (context) => {
  const harness = await startHarness({
    detectedBrowser: 'snapchat',
    blocked: true,
    offerName: null,
  });
  context.after(() => harness.close());
  const canonicalUrl = `${harness.baseUrl}/r/test-token?source=snapchat`;
  const signedUrl = createTrackingHandoffContinuationUrl(
    canonicalUrl,
    TEST_SIGNING_SECRET,
  );
  const response = await fetch(signedUrl, {
    headers: {
      'user-agent': 'Mozilla/5.0 Snapchat/13.0',
    },
    redirect: 'manual',
  });
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(body, /copy the original tracking link/iu);
  assert.doesNotMatch(body, /__tracker_handoff=/u);
  assert.equal(harness.resolverInputs.length, 0);
});
test('social crawler receives preview without handoff or resolver', async (context) => {
  const harness = await startHarness({
    detectedBrowser: 'snapchat',
    blocked: true,
    offerName: null,
  });
  context.after(() => harness.close());
  const response = await fetch(`${harness.baseUrl}/r/test-token?source=snapchat`, {
    headers: {
      'user-agent': 'Snap URL Preview Service',
    },
    redirect: 'manual',
  });
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(body, /Preview Title/u);
  assert.doesNotMatch(body, /__tracker_handoff=/u);
  assert.equal(harness.resolverInputs.length, 0);
  assert.equal(harness.getPreviewCalls(), 1);
  assert.equal(harness.getPreflightCalls(), 0);
});
