/**
 * Gmail tool definitions for CatPaw tool-calling loop.
 *
 * Generates OpenAI-format tool definitions for each Gmail connector
 * linked to a CatPaw. If multiple Gmail connectors exist, tool names
 * include the connector name to disambiguate.
 */

interface GmailConnectorInfo {
  connectorId: string;
  connectorName: string;
}

interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** Metadata to route a tool call to the correct connector + operation */
export interface GmailToolDispatch {
  connectorId: string;
  connectorName: string;
  operation: string;
}

function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 30);
}

export function getGmailToolsForPaw(
  pawId: string,
  gmailConnectors: GmailConnectorInfo[]
): { tools: ToolDefinition[]; dispatch: Map<string, GmailToolDispatch> } {
  const tools: ToolDefinition[] = [];
  const dispatch = new Map<string, GmailToolDispatch>();
  const usePrefix = gmailConnectors.length > 1;

  for (const conn of gmailConnectors) {
    const prefix = usePrefix ? `gmail_${sanitizeName(conn.connectorName)}_` : 'gmail_';
    const accountLabel = conn.connectorName;

    // --- list_emails ---
    const listName = `${prefix}list_emails`;
    tools.push({
      type: 'function',
      function: {
        name: listName,
        description: `Listar los ultimos correos de la cuenta "${accountLabel}". Devuelve resumen con id, asunto, remitente, fecha y si esta leido.`,
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Cantidad maxima de correos a devolver (default: 10, max: 50)' },
            folder: { type: 'string', description: 'Carpeta a listar (default: INBOX). Opciones: INBOX, sent' },
          },
        },
      },
    });
    dispatch.set(listName, { connectorId: conn.connectorId, connectorName: conn.connectorName, operation: 'list_emails' });

    // --- search_emails ---
    const searchName = `${prefix}search_emails`;
    tools.push({
      type: 'function',
      function: {
        name: searchName,
        description: `Buscar correos en la cuenta "${accountLabel}" por consulta. Soporta operadores Gmail: from:, subject:, after:, before:, has:attachment, is:unread, etc.`,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Consulta de busqueda (ej: "from:juan@example.com subject:factura")' },
            limit: { type: 'number', description: 'Cantidad maxima de resultados (default: 10, max: 50)' },
          },
          required: ['query'],
        },
      },
    });
    dispatch.set(searchName, { connectorId: conn.connectorId, connectorName: conn.connectorName, operation: 'search_emails' });

    // --- read_email ---
    const readName = `${prefix}read_email`;
    tools.push({
      type: 'function',
      function: {
        name: readName,
        description: `Leer el contenido completo de un correo de la cuenta "${accountLabel}" por su ID. Usa un ID obtenido de list_emails o search_emails.`,
        parameters: {
          type: 'object',
          properties: {
            messageId: { type: 'string', description: 'ID del correo a leer' },
          },
          required: ['messageId'],
        },
      },
    });
    dispatch.set(readName, { connectorId: conn.connectorId, connectorName: conn.connectorName, operation: 'read_email' });

    // --- draft_email ---
    const draftName = `${prefix}draft_email`;
    tools.push({
      type: 'function',
      function: {
        name: draftName,
        description: `Crear un borrador de correo en la cuenta "${accountLabel}". NO envia el correo, solo lo guarda como borrador en Gmail.`,
        parameters: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Destinatario del correo' },
            subject: { type: 'string', description: 'Asunto del correo' },
            body: { type: 'string', description: 'Cuerpo del correo en texto plano' },
          },
          required: ['to', 'subject', 'body'],
        },
      },
    });
    dispatch.set(draftName, { connectorId: conn.connectorId, connectorName: conn.connectorName, operation: 'draft_email' });

    // --- send_email ---
    const sendName = `${prefix}send_email`;
    tools.push({
      type: 'function',
      function: {
        name: sendName,
        description: `Enviar un correo desde la cuenta "${accountLabel}". IMPORTANTE: Solo usar esta herramienta despues de que el usuario haya confirmado explicitamente que quiere enviar el correo. NUNCA enviar sin confirmacion.`,
        parameters: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Destinatario del correo' },
            subject: { type: 'string', description: 'Asunto del correo' },
            body: { type: 'string', description: 'Cuerpo del correo en texto plano' },
            html_body: { type: 'string', description: 'Cuerpo del correo en HTML (opcional, tiene preferencia sobre body). Usar para informes y emails formateados.' },
            cc: { type: 'array', items: { type: 'string' }, description: 'Lista de emails a poner en copia (CC). Ejemplo: ["info@educa360.com"]' },
          },
          required: ['to', 'subject', 'body'],
        },
      },
    });
    dispatch.set(sendName, { connectorId: conn.connectorId, connectorName: conn.connectorName, operation: 'send_email' });

    // --- get_thread ---
    const getThreadName = `${prefix}get_thread`;
    tools.push({
      type: 'function',
      function: {
        name: getThreadName,
        description: `Obtener todos los mensajes de un hilo de conversacion en la cuenta "${accountLabel}". Devuelve remitente, destinatario, fecha y asunto de cada mensaje del hilo. Util para comprobar si un email ya fue respondido.`,
        parameters: {
          type: 'object',
          properties: {
            threadId: { type: 'string', description: 'ID del hilo (obtenido de search_emails o list_emails)' },
            checkReplyFrom: { type: 'string', description: 'Email a comprobar si respondio en el hilo (ej: info@educa360.com). Si algún mensaje fue enviado desde este email, hasReplyFrom se rellena.' },
          },
          required: ['threadId'],
        },
      },
    });
    dispatch.set(getThreadName, { connectorId: conn.connectorId, connectorName: conn.connectorName, operation: 'get_thread' });

    // --- mark_as_read ---
    const markReadName = `${prefix}mark_as_read`;
    tools.push({
      type: 'function',
      function: {
        name: markReadName,
        description: `Marcar un email como leido en la cuenta "${accountLabel}". Usar despues de procesar un email para que no se reprocese en la siguiente ejecucion.`,
        parameters: {
          type: 'object',
          properties: {
            messageId: { type: 'string', description: 'ID del mensaje a marcar como leido (obtenido de search_emails o list_emails)' },
          },
          required: ['messageId'],
        },
      },
    });
    dispatch.set(markReadName, { connectorId: conn.connectorId, connectorName: conn.connectorName, operation: 'mark_as_read' });

    // --- reply_to_message ---
    const replyName = `${prefix}reply_to_message`;
    tools.push({
      type: 'function',
      function: {
        name: replyName,
        description: `Responder a un email en el mismo hilo de conversacion en la cuenta "${accountLabel}". El reply aparece encadenado en Gmail manteniendo el contexto.`,
        parameters: {
          type: 'object',
          properties: {
            threadId: { type: 'string', description: 'ID del hilo al que se responde (obtenido de search_emails o list_emails)' },
            messageId: { type: 'string', description: 'ID del mensaje original al que se responde (para header In-Reply-To)' },
            to: { type: 'string', description: 'Email del destinatario (normalmente el remitente del email original)' },
            subject: { type: 'string', description: 'Asunto. Si no empieza por "Re:" se añade automaticamente' },
            body: { type: 'string', description: 'Cuerpo del email en texto plano' },
            html_body: { type: 'string', description: 'Cuerpo del email en HTML (opcional, tiene preferencia sobre body)' },
            cc: { type: 'array', items: { type: 'string' }, description: 'Lista de emails a incluir en copia (opcional)' },
          },
          required: ['threadId', 'messageId', 'to', 'subject', 'body'],
        },
      },
    });
    dispatch.set(replyName, { connectorId: conn.connectorId, connectorName: conn.connectorName, operation: 'reply_to_message' });
  }

  return { tools, dispatch };
}
