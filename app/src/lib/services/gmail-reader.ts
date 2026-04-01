import { GmailConfig } from '@/lib/types';
import { decrypt } from '@/lib/crypto';
import { withRetry } from '@/lib/retry';
import { logger } from '@/lib/logger';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { google } = require('googleapis');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const imapSimple = require('imap-simple');

// --- Types ---

export interface EmailSummary {
  id: string;
  threadId?: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  isRead: boolean;
}

export interface EmailDetail {
  id: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  body: string;
  bodyHtml?: string;
  attachments?: string[];
}

export interface ListEmailsOptions {
  folder?: string;
  limit?: number;
  query?: string;
}

// --- Gmail API (OAuth2) ---

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createGmailClient(config: GmailConfig): any {
  if (config.auth_mode !== 'oauth2') {
    throw new Error('Gmail API requiere OAuth2');
  }
  if (!config.client_id && !config.client_id_encrypted) {
    throw new Error('OAuth2 client_id requerido');
  }
  if (!config.client_secret_encrypted) {
    throw new Error('OAuth2 client_secret_encrypted requerido');
  }
  if (!config.refresh_token_encrypted) {
    throw new Error('OAuth2 refresh_token_encrypted requerido');
  }

  const clientId = config.client_id || (config.client_id_encrypted ? decrypt(config.client_id_encrypted) : '');
  const clientSecret = decrypt(config.client_secret_encrypted);
  const refreshToken = decrypt(config.refresh_token_encrypted);

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getHeader(headers: Array<{ name: string; value: string }>, name: string): string {
  const h = headers.find((h: { name: string; value: string }) => h.name.toLowerCase() === name.toLowerCase());
  return h?.value || '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractBody(payload: any): { text: string; html?: string } {
  let text = '';
  let html: string | undefined;

  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    if (payload.mimeType === 'text/html') {
      html = decoded;
    } else {
      text = decoded;
    }
  }

  if (payload.parts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        text = decodeBase64Url(part.body.data);
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        html = decodeBase64Url(part.body.data);
      } else if (part.parts) {
        const nested = extractBody(part);
        if (nested.text) text = nested.text;
        if (nested.html) html = nested.html;
      }
    }
  }

  return { text, html };
}

async function listEmailsGmailApi(config: GmailConfig, options: ListEmailsOptions): Promise<EmailSummary[]> {
  const gmail = createGmailClient(config);
  const limit = Math.min(options.limit || 10, 50);
  const query = options.query || '';
  const labelIds = options.folder === 'sent' ? ['SENT'] : ['INBOX'];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await withRetry(
    () => gmail.users.messages.list({
      userId: 'me',
      maxResults: limit,
      q: query || undefined,
      labelIds: query ? undefined : labelIds,
    }),
    { maxAttempts: 2 }
  );

  const messageIds = res.data.messages || [];
  const summaries: EmailSummary[] = [];

  for (const msg of messageIds.slice(0, limit)) {
    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'metadata',
      metadataHeaders: ['Subject', 'From', 'Date'],
    });

    const headers = detail.data.payload?.headers || [];
    summaries.push({
      id: msg.id,
      threadId: msg.threadId || detail.data.threadId,
      subject: getHeader(headers, 'Subject') || '(sin asunto)',
      from: getHeader(headers, 'From'),
      date: getHeader(headers, 'Date'),
      snippet: detail.data.snippet || '',
      isRead: !(detail.data.labelIds || []).includes('UNREAD'),
    });
  }

  return summaries;
}

async function readEmailGmailApi(config: GmailConfig, messageId: string): Promise<EmailDetail> {
  const gmail = createGmailClient(config);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await withRetry(
    () => gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    }),
    { maxAttempts: 2 }
  );

  const headers = res.data.payload?.headers || [];
  const { text, html } = extractBody(res.data.payload);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attachments = (res.data.payload?.parts || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((p: any) => p.filename && p.filename.length > 0)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((p: any) => p.filename as string);

  return {
    id: messageId,
    subject: getHeader(headers, 'Subject') || '(sin asunto)',
    from: getHeader(headers, 'From'),
    to: getHeader(headers, 'To'),
    date: getHeader(headers, 'Date'),
    body: text || (html ? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : ''),
    bodyHtml: html,
    attachments: attachments.length > 0 ? attachments : undefined,
  };
}

async function searchEmailsGmailApi(config: GmailConfig, query: string, limit?: number): Promise<EmailSummary[]> {
  return listEmailsGmailApi(config, { query, limit });
}

async function draftEmailGmailApi(config: GmailConfig, payload: { to: string; subject: string; body: string }): Promise<{ draftId: string }> {
  const gmail = createGmailClient(config);

  const rawMessage = [
    `To: ${payload.to}`,
    `Subject: ${payload.subject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    payload.body,
  ].join('\r\n');

  const encodedMessage = Buffer.from(rawMessage).toString('base64url');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await withRetry(
    () => gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: { raw: encodedMessage },
      },
    }),
    { maxAttempts: 2 }
  );

  return { draftId: res.data.id };
}

// --- IMAP (App Password) ---

function getImapConfig(config: GmailConfig): { imap: { user: string; password: string; host: string; port: number; tls: boolean; authTimeout: number; tlsOptions: { rejectUnauthorized: boolean } } } {
  if (!config.app_password_encrypted) {
    throw new Error('App Password requerido para acceso IMAP');
  }

  const password = decrypt(config.app_password_encrypted).replace(/\s/g, '');

  return {
    imap: {
      user: config.user,
      password,
      host: 'imap.gmail.com',
      port: 993,
      tls: true,
      authTimeout: 10000,
      tlsOptions: { rejectUnauthorized: false },
    },
  };
}

async function listEmailsImap(config: GmailConfig, options: ListEmailsOptions): Promise<EmailSummary[]> {
  const imapConfig = getImapConfig(config);
  const limit = Math.min(options.limit || 10, 50);
  const folder = options.folder || 'INBOX';

  let connection;
  try {
    connection = await imapSimple.connect(imapConfig);
    await connection.openBox(folder);

    // Search criteria — translate Gmail-style queries to IMAP
    let searchCriteria: unknown[];
    if (!options.query) {
      searchCriteria = ['ALL'];
    } else {
      const q = options.query.trim();
      // Handle Gmail-style operators
      if (q === 'is:unread' || q.includes('is:unread')) {
        searchCriteria = ['UNSEEN'];
        // If there are additional terms besides is:unread, add them
        const extra = q.replace(/is:unread/g, '').trim();
        if (extra) {
          searchCriteria = [['UNSEEN'], ['OR', ['SUBJECT', extra], ['FROM', extra]]];
        }
      } else if (q.startsWith('from:')) {
        searchCriteria = [['FROM', q.slice(5).trim()]];
      } else if (q.startsWith('subject:')) {
        searchCriteria = [['SUBJECT', q.slice(8).trim().replace(/"/g, '')]];
      } else {
        searchCriteria = [['OR', ['SUBJECT', q], ['FROM', q]]];
      }
    }
    const fetchOptions = { bodies: ['HEADER.FIELDS (FROM SUBJECT DATE)'], struct: true };

    const messages = await connection.search(searchCriteria, fetchOptions);

    // Sort by date descending and take limit
    const sorted = messages.sort((a: { attributes: { date: string } }, b: { attributes: { date: string } }) =>
      new Date(b.attributes.date).getTime() - new Date(a.attributes.date).getTime()
    ).slice(0, limit);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return sorted.map((msg: { attributes: { uid: number; date: string; flags: string[] }; parts: Array<{ body: any }> }) => {
      const header = msg.parts[0]?.body || '';
      let subject = '(sin asunto)';
      let from = '';
      let date = new Date(msg.attributes.date).toISOString();

      if (typeof header === 'object' && header !== null) {
        // imap-simple parsed headers as object: { from: ['...'], subject: ['...'], date: ['...'] }
        if (header.subject) subject = (Array.isArray(header.subject) ? header.subject[0] : header.subject) || '(sin asunto)';
        if (header.from) from = (Array.isArray(header.from) ? header.from[0] : header.from) || '';
        if (header.date) date = (Array.isArray(header.date) ? header.date[0] : header.date) || date;
      } else if (typeof header === 'string') {
        // Raw header string — parse with regex
        const subjectMatch = header.match(/Subject:\s*(.+)/i);
        const fromMatch = header.match(/From:\s*(.+)/i);
        const dateMatch = header.match(/Date:\s*(.+)/i);
        if (subjectMatch?.[1]) subject = subjectMatch[1].trim();
        if (fromMatch?.[1]) from = fromMatch[1].trim();
        if (dateMatch?.[1]) date = dateMatch[1].trim();
      }

      return {
        id: String(msg.attributes.uid),
        subject,
        from,
        date,
        snippet: '',
        isRead: (msg.attributes.flags || []).includes('\\Seen'),
      };
    });
  } catch (err) {
    const error = err as Error;
    if (error.message?.includes('AUTHENTICATIONFAILED') || error.message?.includes('Invalid credentials')) {
      throw new Error('Credenciales IMAP invalidas. Verifica tu App Password y que IMAP este habilitado en Gmail.');
    }
    throw error;
  } finally {
    if (connection) {
      try { connection.end(); } catch { /* ignore */ }
    }
  }
}

async function readEmailImap(config: GmailConfig, messageId: string): Promise<EmailDetail> {
  const imapConfig = getImapConfig(config);

  let connection;
  try {
    connection = await imapSimple.connect(imapConfig);
    await connection.openBox('INBOX');

    const searchCriteria = [['UID', messageId]];
    const fetchOptions = { bodies: ['HEADER', 'TEXT', ''], struct: true };

    const messages = await connection.search(searchCriteria, fetchOptions);

    if (messages.length === 0) {
      throw new Error(`Correo con ID ${messageId} no encontrado`);
    }

    const msg = messages[0];
    const headerPart = msg.parts.find((p: { which: string }) => p.which === 'HEADER');
    const textPart = msg.parts.find((p: { which: string }) => p.which === 'TEXT');

    const headers = headerPart?.body || {};
    const subject = Array.isArray(headers.subject) ? headers.subject[0] : (headers.subject || '(sin asunto)');
    const from = Array.isArray(headers.from) ? headers.from[0] : (headers.from || '');
    const to = Array.isArray(headers.to) ? headers.to[0] : (headers.to || '');
    const date = Array.isArray(headers.date) ? headers.date[0] : (headers.date || '');

    const body = textPart?.body || '';

    return {
      id: messageId,
      subject,
      from,
      to,
      date,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    };
  } finally {
    if (connection) {
      try { connection.end(); } catch { /* ignore */ }
    }
  }
}

// --- Gmail API: mark as read ---

async function markAsReadGmailApi(config: GmailConfig, messageId: string): Promise<{ success: boolean; messageId: string }> {
  const gmail = createGmailClient(config);

  await withRetry(
    () => gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        removeLabelIds: ['UNREAD'],
      },
    }),
    { maxAttempts: 2 }
  );

  return { success: true, messageId };
}

// --- Gmail API: reply to message ---

export interface ReplyPayload {
  threadId: string;
  messageId: string;
  to: string;
  subject: string;
  body: string;
  html_body?: string;
  cc?: string[];
}

async function replyToMessageGmailApi(config: GmailConfig, payload: ReplyPayload): Promise<{ success: boolean; messageId: string; threadId: string }> {
  const gmail = createGmailClient(config);

  const subject = payload.subject.startsWith('Re:') ? payload.subject : `Re: ${payload.subject}`;
  const headers = [
    `To: ${payload.to}`,
    ...(payload.cc && payload.cc.length > 0 ? [`Cc: ${payload.cc.join(', ')}`] : []),
    `Subject: ${subject}`,
    `In-Reply-To: ${payload.messageId}`,
    `References: ${payload.messageId}`,
  ];

  if (payload.html_body) {
    headers.push('Content-Type: text/html; charset=utf-8');
    headers.push('');
    headers.push(payload.html_body);
  } else {
    headers.push('Content-Type: text/plain; charset=utf-8');
    headers.push('');
    headers.push(payload.body);
  }

  const rawMessage = headers.join('\r\n');
  const encodedMessage = Buffer.from(rawMessage).toString('base64url');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await withRetry(
    () => gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
        threadId: payload.threadId,
      },
    }),
    { maxAttempts: 2 }
  );

  return { success: true, messageId: res.data.id, threadId: res.data.threadId };
}

// --- Public API ---

// --- IMAP: mark as read ---

async function markAsReadImap(config: GmailConfig, messageId: string): Promise<{ success: boolean; messageId: string }> {
  const imapConfig = getImapConfig(config);
  let connection;
  try {
    connection = await imapSimple.connect(imapConfig);
    await connection.openBox('INBOX');
    await connection.addFlags(messageId, ['\\Seen']);
    return { success: true, messageId };
  } finally {
    if (connection) {
      try { connection.end(); } catch { /* ignore */ }
    }
  }
}

export async function markAsRead(config: GmailConfig, messageId: string): Promise<{ success: boolean; messageId: string }> {
  logger.info('connectors', 'Gmail markAsRead', { user: config.user, auth_mode: config.auth_mode, messageId });

  if (config.auth_mode === 'oauth2') {
    return markAsReadGmailApi(config, messageId);
  }
  return markAsReadImap(config, messageId);
}

export async function replyToMessage(config: GmailConfig, payload: ReplyPayload): Promise<{ success: boolean; messageId: string; threadId: string }> {
  logger.info('connectors', 'Gmail replyToMessage', { user: config.user, auth_mode: config.auth_mode, threadId: payload.threadId });

  if (config.auth_mode === 'oauth2') {
    return replyToMessageGmailApi(config, payload);
  }

  // For App Password: send via SMTP with In-Reply-To/References headers for threading
  const { sendEmail } = await import('./email-service');
  const subject = payload.subject.startsWith('Re:') ? payload.subject : `Re: ${payload.subject}`;
  const result = await sendEmail(config, {
    to: payload.to,
    subject,
    ...(payload.html_body ? { html_body: payload.html_body } : { text_body: payload.body }),
    ...(payload.cc && payload.cc.length > 0 ? { cc: payload.cc } : {}),
    in_reply_to: payload.messageId,
    references: payload.messageId,
  });

  if (!result.ok) {
    throw new Error(result.error || 'Error enviando reply via SMTP');
  }
  return { success: true, messageId: result.messageId || '', threadId: payload.threadId };
}

export async function listEmails(config: GmailConfig, options: ListEmailsOptions = {}): Promise<EmailSummary[]> {
  logger.info('connectors', 'Gmail listEmails', { user: config.user, auth_mode: config.auth_mode, folder: options.folder });

  if (config.auth_mode === 'oauth2') {
    return listEmailsGmailApi(config, options);
  }
  return listEmailsImap(config, options);
}

export async function readEmail(config: GmailConfig, messageId: string): Promise<EmailDetail> {
  logger.info('connectors', 'Gmail readEmail', { user: config.user, auth_mode: config.auth_mode, messageId });

  if (config.auth_mode === 'oauth2') {
    return readEmailGmailApi(config, messageId);
  }
  return readEmailImap(config, messageId);
}

export async function searchEmails(config: GmailConfig, query: string, limit?: number): Promise<EmailSummary[]> {
  logger.info('connectors', 'Gmail searchEmails', { user: config.user, auth_mode: config.auth_mode, query });

  if (config.auth_mode === 'oauth2') {
    return searchEmailsGmailApi(config, query, limit);
  }
  return listEmailsImap(config, { query, limit });
}

export async function draftEmail(config: GmailConfig, payload: { to: string; subject: string; body: string }): Promise<{ draftId: string }> {
  logger.info('connectors', 'Gmail draftEmail', { user: config.user, auth_mode: config.auth_mode, to: payload.to });

  if (config.auth_mode !== 'oauth2') {
    throw new Error('Crear borradores requiere OAuth2. Las cuentas con App Password solo soportan lectura via IMAP.');
  }
  return draftEmailGmailApi(config, payload);
}
