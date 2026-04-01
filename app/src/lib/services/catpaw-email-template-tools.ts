/**
 * Definiciones de tools de email templates para el loop de tool-calling de CatPaw.
 *
 * Genera tools en formato OpenAI para listar, consultar y renderizar
 * plantillas de email corporativas.
 */

interface EmailTemplateConnectorInfo {
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

/** Metadata para enrutar una tool call al conector + operacion correcta */
export interface EmailTemplateToolDispatch {
  connectorId: string;
  connectorName: string;
  operation: string;
}

export function getEmailTemplateToolsForPaw(
  pawId: string,
  connectors: EmailTemplateConnectorInfo[]
): { tools: ToolDefinition[]; dispatch: Map<string, EmailTemplateToolDispatch> } {
  const tools: ToolDefinition[] = [];
  const dispatch = new Map<string, EmailTemplateToolDispatch>();

  for (const conn of connectors) {
    // --- list_email_templates ---
    tools.push({
      type: 'function',
      function: {
        name: 'list_email_templates',
        description: 'Lista las plantillas de email disponibles con nombre, descripcion y categoria.',
        parameters: {
          type: 'object',
          properties: {
            category: { type: 'string', description: 'Filtrar por categoria (ej: "comercial", "informe", "notificacion", "general")' },
          },
        },
      },
    });
    dispatch.set('list_email_templates', {
      connectorId: conn.connectorId,
      connectorName: conn.connectorName,
      operation: 'list_templates',
    });

    // --- get_email_template ---
    tools.push({
      type: 'function',
      function: {
        name: 'get_email_template',
        description: 'Obtiene estructura completa de una plantilla con bloques e instrucciones. Los campos \'text\' de bloques instruction son las claves de variable para render.',
        parameters: {
          type: 'object',
          properties: {
            template_id: { type: 'string', description: 'ID de la plantilla a consultar' },
          },
          required: ['template_id'],
        },
      },
    });
    dispatch.set('get_email_template', {
      connectorId: conn.connectorId,
      connectorName: conn.connectorName,
      operation: 'get_template',
    });

    // --- render_email_template ---
    tools.push({
      type: 'function',
      function: {
        name: 'render_email_template',
        description: 'Renderiza plantilla con variables. Las claves DEBEN coincidir exactamente con el campo \'text\' de los bloques instruction. Devuelve HTML final.',
        parameters: {
          type: 'object',
          properties: {
            template_id: { type: 'string', description: 'ID de la plantilla a renderizar' },
            variables: { type: 'object', description: 'Mapa de claves de instruccion -> contenido. Las claves deben coincidir con el campo "text" de los bloques instruction.' },
          },
          required: ['template_id', 'variables'],
        },
      },
    });
    dispatch.set('render_email_template', {
      connectorId: conn.connectorId,
      connectorName: conn.connectorName,
      operation: 'render_template',
    });
  }

  return { tools, dispatch };
}
