import type { Response } from 'express';
import type { InAppBrowserKind } from './in-app-browser-policy.types.js';
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function browserLabel(browser: InAppBrowserKind): string {
  switch (browser) {
    case 'snapchat':
      return 'Snapchat';
    case 'instagram':
      return 'Instagram';
    case 'facebook':
      return 'Facebook';
    case 'messenger':
      return 'Messenger';
    case 'discord':
      return 'Discord';
    case 'telegram':
      return 'Telegram';
    case 'tiktok':
      return 'TikTok';
    case 'other':
      return 'this in-app browser';
  }
}
export function sendInAppBrowserHandoff(
  response: Response,
  input: Readonly<{
    browser: InAppBrowserKind;
    offerName: string | null;
  }>,
): void {
  const browser = escapeHtml(browserLabel(input.browser));
  const offerName =
    input.offerName === null ? 'Continue in your browser' : escapeHtml(input.offerName);
  response.setHeader('cache-control', 'no-store, max-age=0');
  response.setHeader('pragma', 'no-cache');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('x-robots-tag', 'noindex, nofollow');
  response.setHeader(
    'content-security-policy',
    [
      "default-src 'none'",
      "style-src 'unsafe-inline'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'none'",
    ].join('; '),
  );
  response
    .status(200)
    .type('html')
    .send(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${offerName}</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#eef4fa;color:#122033;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.card{width:min(100%,620px);padding:42px;border-radius:24px;background:#fff;box-shadow:0 24px 70px rgba(0,0,0,.18);text-align:center}.icon{width:78px;height:78px;margin:0 auto 22px;display:grid;place-items:center;border-radius:50%;background:#e8f2ff;color:#1769aa;font-size:36px;font-weight:800}.eyebrow{margin:0 0 10px;color:#1769aa;font-size:13px;font-weight:800;text-transform:uppercase}h1{margin:0 0 14px;font-size:32px;line-height:1.2}.lead{margin:0 auto 24px;max-width:500px;color:#53647a;font-size:17px;line-height:1.6}.steps{margin:0;padding:18px;border:1px solid #dce5ef;border-radius:16px;background:#f8fafc;text-align:left;color:#42556c;line-height:1.8}.note{margin:18px 0 0;color:#718096;font-size:13px}@media(max-width:560px){.card{padding:32px 22px}}@media(prefers-color-scheme:dark){body{background:#071526;color:#eef5fc}.card{background:#101e2d}.lead,.steps{color:#a7b7c9}.steps{background:#0b1928;border-color:#294057}.eyebrow{color:#72b8ef}}</style></head><body><main class="card"><div class="icon" aria-hidden="true">&#8599;</div><p class="eyebrow">${browser}</p><h1>${offerName}</h1><p class="lead">This link was opened inside ${browser}. To keep the offer separate from your chat, return to the message, copy the original tracking link, and paste it into Chrome, Safari, Firefox, Opera, or another standalone browser.</p><div class="steps"><strong>How to continue</strong><br>1. Go back to the chat or message where you received this link.<br>2. Copy the original tracking link without opening it.<br>3. Open Chrome, Safari, Firefox, Opera, or another browser as a separate app and paste the link into the address bar.</div><p class="note">This page did not open or redirect to the offer.</p></main></body></html>`,
    );
}
