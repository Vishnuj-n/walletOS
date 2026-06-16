import nodemailer from 'nodemailer';

const smtpHost = process.env.GLOBAL_SMTP_HOST || 'smtp.gmail.com';
const smtpPort = process.env.GLOBAL_SMTP_PORT ? parseInt(process.env.GLOBAL_SMTP_PORT, 10) : 465;
const smtpSecure = process.env.GLOBAL_SMTP_SECURE ? process.env.GLOBAL_SMTP_SECURE === 'true' : smtpPort === 465;

const globalSmtpTransporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  auth: {
    user: process.env.GLOBAL_SMTP_USER,
    pass: process.env.GLOBAL_SMTP_PASS,
  },
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
});

const DEFAULT_ADMIN_CLAIM_REDIRECT_URL = 'http://localhost:3000';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getAdminClaimRedirectBaseUrl(): string {
  const configuredBaseUrl = process.env.ADMIN_CLAIM_REDIRECT_URL?.trim();
  if (!configuredBaseUrl) {
    console.warn(
      `[INVITE] ADMIN_CLAIM_REDIRECT_URL not set. Falling back to ${DEFAULT_ADMIN_CLAIM_REDIRECT_URL}.`
    );
    return DEFAULT_ADMIN_CLAIM_REDIRECT_URL;
  }

  return configuredBaseUrl;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function sendInviteEmail(tenantId: string, email: string, rawToken: string): Promise<void> {
  let activationUrl: string;
  try {
    const activationUrlObj = new URL('/claim', getAdminClaimRedirectBaseUrl());
    activationUrlObj.searchParams.set('token', rawToken);
    activationUrl = activationUrlObj.toString();
  } catch (error) {
    console.error(
      `[INVITE] Failed to parse ADMIN_CLAIM_REDIRECT_URL. Falling back to ${DEFAULT_ADMIN_CLAIM_REDIRECT_URL}.`,
      error
    );
    const fallbackUrl = new URL('/claim', DEFAULT_ADMIN_CLAIM_REDIRECT_URL);
    fallbackUrl.searchParams.set('token', rawToken);
    activationUrl = fallbackUrl.toString();
  }
  const escapedTenantId = escapeHtml(tenantId);
  const escapedActivationUrl = escapeHtml(activationUrl);

  try {
    await globalSmtpTransporter.sendMail({
      from: process.env.GLOBAL_SMTP_USER,
      to: email,
      subject: 'WalletOS Invitation - Activate Your Account',
      html: `
        <div>
          <p>You have been invited to WalletOS.</p>
          <p>Tenant: ${escapedTenantId}</p>
          <p>
            Activate your account:
            <a href="${escapedActivationUrl}">${escapedActivationUrl}</a>
          </p>
          <p>This link expires in 24 hours.</p>
        </div>
      `,
    });
  } catch (error: any) {
    const sanitize = (str: string) => {
      if (!str) return str;
      let sanitized = str;
      if (activationUrl) {
        sanitized = sanitized.replace(new RegExp(escapeRegExp(activationUrl), 'g'), '[REDACTED_INVITE_ACTIVATION_URL]');
      }
      if (rawToken) {
        sanitized = sanitized.replace(new RegExp(escapeRegExp(rawToken), 'g'), '[REDACTED_TOKEN]');
      }
      return sanitized;
    };

    const safeMessage = error instanceof Error ? sanitize(error.message) : 'Unknown error';
    const safeStack = error instanceof Error && error.stack ? sanitize(error.stack) : undefined;
    
    console.error('sendInviteEmail failed:', safeMessage, safeStack ? `\n${safeStack}` : '');
    throw error;
  }
}

export async function verifyGlobalSmtpHealth(): Promise<void> {
  const hasUser = Boolean(process.env.GLOBAL_SMTP_USER);
  const hasPass = Boolean(process.env.GLOBAL_SMTP_PASS);
  const claimRedirectUrl = process.env.ADMIN_CLAIM_REDIRECT_URL?.trim();
  const hasClaimRedirectUrl = Boolean(claimRedirectUrl);

  console.log(`[SMTP] GLOBAL_SMTP_HOST: ${smtpHost}`);
  console.log(`[SMTP] GLOBAL_SMTP_PORT: ${smtpPort}`);
  console.log(`[SMTP] GLOBAL_SMTP_SECURE: ${smtpSecure}`);
  console.log(`[SMTP] GLOBAL_SMTP_USER loaded: ${hasUser ? 'yes' : 'no'}`);
  console.log(`[SMTP] GLOBAL_SMTP_PASS loaded: ${hasPass ? 'yes' : 'no'}`);
  console.log(`[INVITE] ADMIN_CLAIM_REDIRECT_URL loaded: ${hasClaimRedirectUrl ? 'yes' : 'no'}`);
  if (hasClaimRedirectUrl) {
    try {
      const parsed = new URL(claimRedirectUrl as string);
      console.log(`[INVITE] ADMIN_CLAIM_REDIRECT_URL valid: yes (${parsed.origin})`);
    } catch (error) {
      console.error('[INVITE] ADMIN_CLAIM_REDIRECT_URL valid: no', error);
    }
  } else {
    console.warn(
      `[INVITE] ADMIN_CLAIM_REDIRECT_URL missing. Invite links will fall back to ${DEFAULT_ADMIN_CLAIM_REDIRECT_URL}.`
    );
  }

  if (!hasUser || !hasPass) {
    console.warn('[SMTP] Skipping transporter.verify() because SMTP credentials are not fully configured.');
    return;
  }

  try {
    await globalSmtpTransporter.verify();
    console.log('[SMTP] transporter.verify() reachable: yes');
  } catch (error) {
    console.error('[SMTP] transporter.verify() reachable: no', error);
  }
}
