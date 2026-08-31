import type { Response } from 'express';
import type { TrackingPreviewMetadata } from './tracking-preview.service.js';
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
export function sendTrackingPreviewResponse(
  response: Response,
  input: Readonly<{
    canonicalUrl: string;
    metadata: TrackingPreviewMetadata;
  }>,
): void {
  const title = escapeHtml(input.metadata.title);
  const canonicalUrl = escapeHtml(input.canonicalUrl);
  const description = 'View this offer securely in your browser.';
  const imageTags =
    input.metadata.imageUrl === null
      ? ''
      : `<meta property="og:image" content="${escapeHtml(input.metadata.imageUrl)}"><meta name="twitter:image" content="${escapeHtml(input.metadata.imageUrl)}">`;
  response.setHeader('cache-control', 'public, max-age=300');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('x-robots-tag', 'noindex, nofollow');
  response
    .status(200)
    .type('html')
    .send(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta name="description" content="${description}"><meta property="og:type" content="website"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${canonicalUrl}">${imageTags}<meta name="twitter:card" content="summary"><meta name="twitter:title" content="${title}"><meta name="twitter:description" content="${description}"></head><body></body></html>`,
    );
}
