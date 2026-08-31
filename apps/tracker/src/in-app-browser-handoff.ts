import { randomBytes } from 'node:crypto';
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
    canonicalUrl: string;
    offerName: string | null;
  }>,
): void {
  const browser = escapeHtml(browserLabel(input.browser));
  const canonicalUrl = escapeHtml(input.canonicalUrl);
  const offerName =
    input.offerName === null ? 'Continue in your browser' : escapeHtml(input.offerName);
  const scriptNonce = randomBytes(18).toString('base64url');
  response.setHeader('cache-control', 'no-store, max-age=0');
  response.setHeader('pragma', 'no-cache');
  response.setHeader('referrer-policy', 'no-referrer');
  response.setHeader('x-robots-tag', 'noindex, nofollow');
  response.setHeader(
    'content-security-policy',
    [
      "default-src 'none'",
      "style-src 'unsafe-inline'",
      `script-src 'nonce-${scriptNonce}'`,
      "base-uri 'none'",
      "frame-ancestors 'none'",
      "form-action 'none'",
    ].join('; '),
  );
  response
    .status(200)
    .type('html')
    .send(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${offerName}</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#eef4fa;color:#122033;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.card{width:min(100%,620px);padding:42px;border-radius:24px;background:#fff;box-shadow:0 24px 70px rgba(0,0,0,.18);text-align:center}.icon{width:78px;height:78px;margin:0 auto 22px;display:grid;place-items:center;border-radius:50%;background:#e8f2ff;color:#1769aa;font-size:36px;font-weight:800}.eyebrow{margin:0 0 10px;color:#1769aa;font-size:13px;font-weight:800;text-transform:uppercase}h1{margin:0 0 14px;font-size:32px;line-height:1.2}.lead{margin:0 auto 24px;max-width:500px;color:#53647a;font-size:17px;line-height:1.6}.steps{margin:0 0 24px;padding:18px;border:1px solid #dce5ef;border-radius:16px;background:#f8fafc;text-align:left;color:#42556c;line-height:1.7}.url{overflow-wrap:anywhere;margin:0;padding:14px 16px;border-radius:12px;background:#eef6ff;color:#174a82;font:600 13px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace}.copy{width:100%;margin-top:14px;padding:13px 18px;border:0;border-radius:12px;background:#1769aa;color:#fff;font:700 15px/1.2 inherit;cursor:pointer}.copy:focus-visible{outline:3px solid #72b8ef;outline-offset:3px}.status{min-height:20px;margin:10px 0 0;color:#53647a;font-size:13px}.note{margin:18px 0 0;color:#718096;font-size:13px}@media(max-width:560px){.card{padding:32px 22px}}@media(prefers-color-scheme:dark){body{background:#071526;color:#eef5fc}.card{background:#101e2d}.lead,.steps,.status{color:#a7b7c9}.steps{background:#0b1928;border-color:#294057}.url{background:#132b43;color:#bbddff}.eyebrow{color:#72b8ef}.copy{background:#267fbd}}</style></head><body><main class="card"><div class="icon" aria-hidden="true">&#8599;</div><p class="eyebrow">${browser} browser</p><h1>${offerName}</h1><p class="lead">Please open this page in Chrome, Safari, or another browser to continue.</p><div class="steps"><strong>How to continue</strong><br>1. Open the ${browser} browser menu.<br>2. Choose the option to open this page in your default browser.<br>3. If unavailable, copy the link below and paste it into Chrome or Safari.</div><p class="url" id="tracking-url">${canonicalUrl}</p><button class="copy" id="copy-link" type="button">Copy Link</button><p class="status" id="copy-status" aria-live="polite"></p><p class="note">No destination redirect was performed from this in-app browser.</p></main><script nonce="${scriptNonce}">(()=>{const button=document.getElementById("copy-link");const url=document.getElementById("tracking-url");const status=document.getElementById("copy-status");if(!(button instanceof HTMLButtonElement)||url===null||status===null){return;}const copyFallback=(value)=>{const area=document.createElement("textarea");area.value=value;area.setAttribute("readonly","");area.style.position="fixed";area.style.opacity="0";document.body.append(area);area.select();const copied=document.execCommand("copy");area.remove();return copied;};button.addEventListener("click",async()=>{const value=url.textContent??"";try{if(navigator.clipboard?.writeText!==undefined){await navigator.clipboard.writeText(value);}else if(!copyFallback(value)){throw new Error("copy unavailable");}status.textContent="Link copied.";}catch{status.textContent=copyFallback(value)?"Link copied.":"Copy failed. Press and hold the link above to copy it.";}});})();</script></body></html>`,
    );
}
