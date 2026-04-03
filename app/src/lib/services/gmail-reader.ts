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

export interface ThreadMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  date: string;
  subject: string;
  snippet: string;
  isRead: boolean;
}

export interface ThreadDetail {
  threadId: string;
  subject: string;
  messages: ThreadMessage[];
  messageCount: number;
  hasReplyFrom?: string; // email address that replied (if any)
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

async function getThreadGmailApi(config: GmailConfig, threadId: string): Promise<ThreadDetail> {
  const gmail = createGmailClient(config);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = await withRetry(
    () => gmail.users.threads.get({
      userId: 'me',
      id: threadId,
      format: 'metadata',
      metadataHeaders: ['Subject', 'From', 'To', 'Date'],
    }),
    { maxAttempts: 2 }
  );

  const messages: ThreadMessage[] = (res.data.messages || []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (msg: any) => {
      const headers = msg.payload?.headers || [];
      return {
        id: msg.id,
        threadId: msg.threadId,
        from: getHeader(headers, 'From'),
        to: getHeader(headers, 'To'),
        date: getHeader(headers, 'Date'),
        subject: getHeader(headers, 'Subject') || '(sin asunto)',
        snippet: msg.snippet || '',
        isRead: !(msg.labelIds || []).includes('UNREAD'),
      };
    }
  );

  return {
    threadId,
    subject: messages[0]?.subject || '(sin asunto)',
    messages,
    messageCount: messages.length,
  };
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
      const criteria: unknown[] = [];

      // Parse multiple operators from the query string
      let remaining = q;

      // is:unread → UNSEEN
      if (remaining.includes('is:unread')) {
        criteria.push('UNSEEN');
        remaining = remaining.replace(/is:unread/g, '').trim();
      }

      // from:xxx
      const fromMatch = remaining.match(/from:(\S+)/);
      if (fromMatch) {
        criteria.push(['FROM', fromMatch[1]]);
        remaining = remaining.replace(/from:\S+/, '').trim();
      }

      // subject:xxx or subject:"xxx"
      const subjectMatch = remaining.match(/subject:(?:"([^"]+)"|(\S+))/);
      if (subjectMatch) {
        criteria.push(['SUBJECT', subjectMatch[1] || subjectMatch[2]]);
        remaining = remaining.replace(/subject:(?:"[^"]+"|[^\s]+)/, '').trim();
      }

      // after:YYYY/MM/DD or after:YYYY-MM-DD → SINCE
      const afterMatch = remaining.match(/after:(\d{4}[/-]\d{1,2}[/-]\d{1,2})/);
      if (afterMatch) {
        const d = new Date(afterMatch[1].replace(/\//g, '-'));
        if (!isNaN(d.getTime())) criteria.push(['SINCE', d]);
        remaining = remaining.replace(/after:\S+/, '').trim();
      }

      // before:YYYY/MM/DD → BEFORE
      const beforeMatch = remaining.match(/before:(\d{4}[/-]\d{1,2}[/-]\d{1,2})/);
      if (beforeMatch) {
        const d = new Date(beforeMatch[1].replace(/\//g, '-'));
        if (!isNaN(d.getTime())) criteria.push(['BEFORE', d]);
        remaining = remaining.replace(/before:\S+/, '').trim();
      }

      // Any remaining text as generic subject/from search
      if (remaining.trim()) {
        criteria.push(['OR', ['SUBJECT', remaining.trim()], ['FROM', remaining.trim()]]);
      }

      searchCriteria = criteria.length > 0 ? criteria : ['ALL'];
    }
    const fetchOptions = { bodies: ['HEADER.FIELDS (FROM SUBJECT DATE)'], struct: true, extensions: ['X-GM-EXT-1'] };

    const messages = await connection.search(searchCriteria, fetchOptions);

    // Sort by date descending and take limit
    const sorted = messages.sort((a: { attributes: { date: string } }, b: { attributes: { date: string } }) =>
      new Date(b.attributes.date).getTime() - new Date(a.attributes.date).getTime()
    ).slice(0, limit);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return sorted.map((msg: { attributes: Record<string, any>; parts: Array<{ body: any }> }) => {
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
        threadId: msg.attributes['x-gm-thrid'] ? String(msg.attributes['x-gm-thrid']) : undefined,
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

// --- IMAP: get thread (X-GM-THRID) ---

async function getThreadImap(config: GmailConfig, threadId: string): Promise<ThreadDetail> {
  const imapConfig = getImapConfig(config);
  let connection;
  try {
    connection = await imapSimple.connect(imapConfig);
    await connection.openBox('INBOX');

    // Search all folders for messages in this thread using Gmail IMAP extension
    const searchCriteria = [['X-GM-THRID', threadId]];
    const fetchOptions = {
      bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE MESSAGE-ID)'],
      struct: true,
    };

    const messages = await connection.search(searchCriteria, fetchOptions);

    // Also search Sent folder
    let sentMessages: typeof messages = [];
    try {
      await connection.openBox('[Gmail]/Sent Mail');
      sentMessages = await connection.search(searchCriteria, fetchOptions);
    } catch {
      // Sent folder might have different name in some locales
      try {
        await connection.openBox('[Gmail]/Enviados');
        sentMessages = await connection.search(searchCriteria, fetchOptions);
      } catch { /* ignore */ }
    }

    const allMessages = [...messages, ...sentMessages];

    // Deduplicate by Message-ID
    const seen = new Set<string>();
    const unique = allMessages.filter((msg: { parts: Array<{ body: Record<string, string[]> }> }) => {
      const header = msg.parts[0]?.body || {};
      const msgId = Array.isArray(header['message-id']) ? header['message-id'][0] : (header['message-id'] || '');
      if (seen.has(msgId)) return false;
      seen.add(msgId);
      return true;
    });

    // Parse into ThreadMessage objects
    const threadMessages: ThreadMessage[] = unique.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (msg: any) => {
        const header = msg.parts[0]?.body || {};
        const parseField = (field: string[] | string | undefined): string =>
          Array.isArray(field) ? field[0] || '' : (field || '');

        return {
          id: String(msg.attributes?.uid || ''),
          threadId,
          from: parseField(header.from),
          to: parseField(header.to),
          date: parseField(header.date) || new Date(msg.attributes?.date).toISOString(),
          subject: parseField(header.subject) || '(sin asunto)',
          snippet: '',
          isRead: (msg.attributes?.flags || []).includes('\\Seen'),
        };
      }
    );

    // Sort by date ascending (oldest first — natural conversation order)
    threadMessages.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {
      threadId,
      subject: threadMessages[0]?.subject || '(sin asunto)',
      messages: threadMessages,
      messageCount: threadMessages.length,
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

  const rawSubject = payload.subject.startsWith('Re:') ? payload.subject : `Re: ${payload.subject}`;
  // RFC 2047 encode subject for non-ASCII characters (UTF-8 Base64)
  const encodedSubject = /[^\x00-\x7F]/.test(rawSubject)
    ? `=?UTF-8?B?${Buffer.from(rawSubject, 'utf-8').toString('base64')}?=`
    : rawSubject;
  const headers = [
    `To: ${payload.to}`,
    ...(payload.cc && payload.cc.length > 0 ? [`Cc: ${payload.cc.join(', ')}`] : []),
    `Subject: ${encodedSubject}`,
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

export async function getThread(config: GmailConfig, threadId: string, checkReplyFrom?: string): Promise<ThreadDetail> {
  logger.info('connectors', 'Gmail getThread', { user: config.user, auth_mode: config.auth_mode, threadId });

  let result: ThreadDetail;
  if (config.auth_mode === 'oauth2') {
    result = await getThreadGmailApi(config, threadId);
  } else {
    result = await getThreadImap(config, threadId);
  }

  // If checkReplyFrom is provided, check if any message in the thread was sent by that address
  if (checkReplyFrom) {
    const normalizedCheck = checkReplyFrom.toLowerCase();
    const replyMsg = result.messages.find(m =>
      m.from.toLowerCase().includes(normalizedCheck)
    );
    if (replyMsg) {
      result.hasReplyFrom = checkReplyFrom;
    }
  }

  return result;
}

export async function draftEmail(config: GmailConfig, payload: { to: string; subject: string; body: string }): Promise<{ draftId: string }> {
  logger.info('connectors', 'Gmail draftEmail', { user: config.user, auth_mode: config.auth_mode, to: payload.to });

  if (config.auth_mode !== 'oauth2') {
    throw new Error('Crear borradores requiere OAuth2. Las cuentas con App Password solo soportan lectura via IMAP.');
  }
  return draftEmailGmailApi(config, payload);
}
