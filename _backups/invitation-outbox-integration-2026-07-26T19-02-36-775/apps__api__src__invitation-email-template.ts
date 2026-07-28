import type { CompanyRole } from '@affiliate-tracker/contracts';

const ROLE_LABELS: Readonly<Record<CompanyRole, string>> = Object.freeze({
  company_admin: 'Company Admin',
  manager: 'Manager',
  publisher: 'Publisher',
});

export interface RenderCompanyInvitationEmailInput {
  readonly companyName: string;
  readonly role: CompanyRole;
  readonly actionLink: string;
  readonly expiresAt: string;
}

export interface RenderedCompanyInvitationEmail {
  readonly subject: string;
  readonly htmlContent: string;
  readonly textContent: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&#39;');
}

function normalizeRequiredText(
  value: string,
  fieldName: string,
  maximumLength: number,
): string {
  const normalizedValue = value.trim();

  if (
    normalizedValue.length === 0 ||
    normalizedValue.length > maximumLength
  ) {
    throw new Error(
      `${fieldName} must contain between 1 and ${String(maximumLength)} characters.`,
    );
  }

  return normalizedValue;
}

function formatExpiry(value: string): string {
  const expiry = new Date(value);

  if (Number.isNaN(expiry.getTime())) {
    throw new Error('Invitation expiry must be a valid timestamp.');
  }

  return expiry.toUTCString();
}

export function renderCompanyInvitationEmail(
  input: RenderCompanyInvitationEmailInput,
): RenderedCompanyInvitationEmail {
  const companyName = normalizeRequiredText(
    input.companyName,
    'Company name',
    160,
  );
  const actionLink = normalizeRequiredText(
    input.actionLink,
    'Invitation action link',
    8_192,
  );
  const roleLabel = ROLE_LABELS[input.role];
  const expiryText = formatExpiry(input.expiresAt);
  const subject = `You're invited to ${companyName}`;
  const safeCompanyName = escapeHtml(companyName);
  const safeRoleLabel = escapeHtml(roleLabel);
  const safeActionLink = escapeHtml(actionLink);
  const safeExpiryText = escapeHtml(expiryText);

  const htmlContent = `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#172033;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;box-shadow:0 16px 40px rgba(15,23,42,0.10);overflow:hidden;">
            <tr>
              <td style="padding:28px 32px;background:linear-gradient(135deg,#6d28d9,#8b5cf6);color:#ffffff;">
                <div style="font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;opacity:0.9;">Publisher Tracker</div>
                <h1 style="margin:10px 0 0;font-size:28px;line-height:1.25;">You have been invited</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 18px;font-size:16px;line-height:1.65;">You have been invited to join <strong>${safeCompanyName}</strong> as a <strong>${safeRoleLabel}</strong>.</p>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#475569;">Use the secure button below to sign in or set up your account, then complete the invitation acceptance process.</p>
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 26px;">
                  <tr>
                    <td style="border-radius:12px;background:#6d28d9;">
                      <a href="${safeActionLink}" style="display:inline-block;padding:14px 24px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;border-radius:12px;">Accept invitation</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#64748b;">This invitation expires on ${safeExpiryText}.</p>
                <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#64748b;">If the button does not work, copy and paste this secure link into your browser:</p>
                <p style="margin:0;word-break:break-all;font-size:12px;line-height:1.6;color:#6d28d9;">${safeActionLink}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.6;color:#64748b;">
                If you were not expecting this invitation, you can safely ignore this email. Never share this secure link with anyone.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();

  const textContent = [
    'Publisher Tracker',
    '',
    `You have been invited to join ${companyName} as a ${roleLabel}.`,
    '',
    'Open the secure link below to sign in or set up your account and accept the invitation:',
    actionLink,
    '',
    `This invitation expires on ${expiryText}.`,
    '',
    'If you were not expecting this invitation, you can safely ignore this email.',
    'Never share this secure link with anyone.',
  ].join('\n');

  return Object.freeze({
    subject,
    htmlContent,
    textContent,
  });
}
