import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { GmailConfig, EmailPayload } from '@/lib/types';
import { decrypt } from '@/lib/crypto';
import { withRetry } from '@/lib/retry';
import { logger } from '@/lib/logger';

/**
 * Translate common Nodemailer errors to user-friendly Spanish messages.
 */
export function translateError(err: Error): string {
  const msg = err.message || '';

  if (msg.includes('ECONNREFUSED')) {
    return 'No se pudo conectar al servidor SMTP';
  }
  if (msg.includes('535') || msg.includes('534')) {
    return 'Credenciales invalidas. Verifica tu App Password';
  }
  if (msg.includes('ETIMEDOUT')) {
    return 'Tiempo de espera agotado al conectar con Gmail';
  }
  if (msg.includes('self signed') || msg.includes('self-signed')) {
    return 'Error de certificado SSL';
  }

  return msg;
}

/**
 * Check if an error is an authentication error (should not be retried).
 */
function isAuthError(err: Error): boolean {
  const msg = (err.message || '').toLowerCase();
  return (
    msg.includes('auth') ||
    msg.includes('535') ||
    msg.includes('534') ||
    msg.includes('invalid') ||
    msg.includes('credentials')
  );
}

/**
 * Create a Nodemailer transporter for the given Gmail configuration.
 */
export function createTransporter(config: GmailConfig): Transporter {
  logger.info('connectors', 'Creating Gmail transporter', {
    user: config.user,
    account_type: config.account_type,
    auth_mode: config.auth_mode,
  });

  if (config.auth_mode === 'app_password') {
    if (!config.app_password_encrypted) {
      throw new Error('App Password encrypted value is required');
    }

    const decryptedPassword = decrypt(config.app_password_encrypted).replace(/\s/g, '');

    if (config.account_type === 'workspace') {
      // Google Workspace: smtp-relay.gmail.com with implicit TLS
      // name: EHLO greeting — Docker returns container ID from os.hostname(),
      // which Google rejects with 421. Use the user's email domain instead.
      const workspaceDomain = config.user.split('@')[1] || 'gmail.com';
      return nodemailer.createTransport({
        host: 'smtp-relay.gmail.com',
        port: 465,
        secure: true,
        name: workspaceDomain,
        auth: {
          user: config.user,
          pass: decryptedPassword,
        },
      });
    }

    // Personal Gmail: service shorthand (smtp.gmail.com:587)
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: config.user,
        pass: decryptedPassword,
      },
    });
  }

  if (config.auth_mode === 'oauth2') {
    if (!config.client_id_encrypted && !config.client_id) {
      throw new Error('OAuth2 client_id is required');
    }
    if (!config.client_secret_encrypted) {
      throw new Error('OAuth2 client_secret_encrypted is required');
    }
    if (!config.refresh_token_encrypted) {
      throw new Error('OAuth2 refresh_token_encrypted is required');
    }

    const clientId = config.client_id || (config.client_id_encrypted ? decrypt(config.client_id_encrypted) : '');
    const clientSecret = decrypt(config.client_secret_encrypted);
    const refreshToken = decrypt(config.refresh_token_encrypted);

    logger.info('connectors', 'Creating OAuth2 Gmail transporter', {
      user: config.user,
      auth_mode: 'oauth2',
      account_type: config.account_type,
    });

    // Nodemailer handles OAuth2 token refresh internally when given
    // clientId, clientSecret, and refreshToken — no manual accessToken needed.
    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        type: 'OAuth2',
        user: config.user,
        clientId,
        clientSecret,
        refreshToken,
      },
    });
  }

  throw new Error(`Unsupported auth_mode: ${config.auth_mode}`);
}

/**
 * Test the SMTP connection with the given Gmail configuration.
 */
export async function testConnection(
  config: GmailConfig
): Promise<{ ok: boolean; error?: string }> {
  try {
    const transporter = createTransporter(config);

    await withRetry(
      () => transporter.verify(),
      {
        maxAttempts: 2,
        shouldRetry: (err: Error) => !isAuthError(err),
      }
    );

    logger.info('connectors', 'Gmail connection test passed', { user: config.user });
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const translated = translateError(error);
    logger.error('connectors', 'Gmail connection test failed', {
      user: config.user,
      error: translated,
    });
    return { ok: false, error: translated };
  }
}

/**
 * Send an email via Gmail using the given configuration and payload.
 */
export async function sendEmail(
  config: GmailConfig,
  payload: EmailPayload
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  // Validate payload
  if (!payload.to) {
    return { ok: false, error: 'Destinatario (to) es requerido' };
  }
  if (!payload.subject) {
    return { ok: false, error: 'Asunto (subject) es requerido' };
  }
  if (!payload.html_body && !payload.text_body) {
    return { ok: false, error: 'Se requiere al menos html_body o text_body' };
  }

  try {
    const transporter = createTransporter(config);

    const fromName = config.from_name || 'DoCatFlow';
    const to = Array.isArray(payload.to) ? payload.to.join(', ') : payload.to;

    const hasHtml = !!payload.html_body;
    const mailOptions: nodemailer.SendMailOptions = {
      from: `"${fromName}" <${config.user}>`,
      to,
      subject: payload.subject,
      ...(hasHtml ? { html: payload.html_body } : {}),
      // Only include text when there's no HTML — some clients show text over html when both present
      ...(!hasHtml && payload.text_body ? { text: payload.text_body } : {}),
      ...(payload.reply_to ? { replyTo: payload.reply_to } : {}),
    };

    const info = await withRetry(
      () => transporter.sendMail(mailOptions),
      {
        maxAttempts: 2,
        shouldRetry: (err: Error) => !isAuthError(err),
      }
    );

    logger.info('connectors', 'Email sent successfully', {
      to,
      subject: payload.subject,
      messageId: info.messageId,
    });

    return { ok: true, messageId: info.messageId };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const translated = translateError(error);
    logger.error('connectors', 'Email send failed', {
      to: Array.isArray(payload.to) ? payload.to.join(', ') : payload.to,
      subject: payload.subject,
      error: translated,
    });
    return { ok: false, error: translated };
  }
}
