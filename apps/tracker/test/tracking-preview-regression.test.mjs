import assert from 'node:assert/strict';
import test from 'node:test';

import { createTrackingPreviewService } from '../dist/tracking-preview.service.js';
import { sendTrackingPreviewResponse } from '../dist/tracking-preview-response.js';

function makePolicy(overrides = {}) {
  return {
    offerName: 'Internal Offer Name',
    socialPreviewTitle: null,
    socialPreviewDescription: null,
    socialPreviewImageUrl: null,
    companyLogoUrl: null,
    blockedInAppBrowsers: [],
    ...overrides,
  };
}

test('preview service uses offer-specific social preview description', async () => {
  const repository = {
    async findPublicPolicy() {
      return makePolicy({
        socialPreviewTitle: 'Survey - Dating',
        socialPreviewDescription: 'Copy and paste the link on your browser to continue.',
      });
    },
    async findReferencePolicy() { return undefined; },
  };

  const service = createTrackingPreviewService(repository);
  const metadata = await service.resolvePublicPreview({
    hostname: 'go.example.com',
    publicToken: 'abc123',
  });

  assert.equal(metadata?.title, 'Survey - Dating');
  assert.equal(metadata?.description, 'Copy and paste the link on your browser to continue.');
});

test('preview service preserves the existing default description when blank', async () => {
  const repository = {
    async findPublicPolicy() {
      return makePolicy({ socialPreviewDescription: '   ' });
    },
    async findReferencePolicy() { return undefined; },
  };

  const service = createTrackingPreviewService(repository);
  const metadata = await service.resolvePublicPreview({
    hostname: 'go.example.com',
    publicToken: 'abc123',
  });

  assert.equal(metadata?.description, 'View this offer securely in your browser.');
});

test('preview response emits escaped description metadata', () => {
  let body = '';
  const response = {
    setHeader() {},
    status(code) { assert.equal(code, 200); return this; },
    type(value) { assert.equal(value, 'html'); return this; },
    send(value) { body = value; return this; },
  };

  sendTrackingPreviewResponse(response, {
    canonicalUrl: 'https://go.example.com/r/123',
    metadata: {
      title: 'Survey - Dating',
      description: 'Copy & paste <this> "link".',
      imageUrl: null,
    },
  });

  assert.match(body, /<meta property="og:description" content="Copy &amp; paste &lt;this&gt; &quot;link&quot;\.">/);
  assert.match(body, /<meta name="twitter:description" content="Copy &amp; paste &lt;this&gt; &quot;link&quot;\.">/);
});