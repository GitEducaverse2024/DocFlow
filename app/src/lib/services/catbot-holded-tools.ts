import { logger } from '@/lib/logger';

// Re-use existing interfaces
import type { CatBotTool, ToolCallResult } from './catbot-tools';

const HOLDED_MCP_URL = process['env']['HOLDED_MCP_URL'];

// ─── Tool definitions ───

const HOLDED_TOOLS: CatBotTool[] = [
  {
    type: 'function',
    function: {
      name: 'holded_search_contact',
      description: 'Busca contactos en Holded por nombre, email, NIF/CIF o nombre comercial. Devuelve lista paginada.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Texto de busqueda (nombre, email, NIF, nombre comercial)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'holded_contact_context',
      description: 'Obtiene contexto completo de un contacto: datos, facturas recientes, leads y eventos.',
      parameters: {
        type: 'object',
        properties: {
          contact: { type: 'string', description: 'Nombre o ID del contacto' },
        },
        required: ['contact'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'holded_quick_invoice',
      description: 'Crea una factura rapida en Holded. Resuelve contacto por nombre y acepta items simplificados.',
      parameters: {
        type: 'object',
        properties: {
          contact: { type: 'string', description: 'Nombre o ID del contacto' },
          items: {
            type: 'array',
            description: 'Items de la factura [{name, units, subtotal}]',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                units: { type: 'number' },
                subtotal: { type: 'number' },
              },
              required: ['name', 'units', 'subtotal'],
            },
          },
          desc: { type: 'string', description: 'Descripcion opcional de la factura' },
        },
        required: ['contact', 'items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'holded_list_invoices',
      description: 'Lista facturas de un contacto con filtros opcionales (estado de pago, rango de fechas).',
      parameters: {
        type: 'object',
        properties: {
          contact: { type: 'string', description: 'Nombre o ID del contacto' },
          status: { type: 'string', description: 'Filtro: paid, unpaid, overdue (opcional)' },
          limit: { type: 'number', description: 'Maximo de resultados (default 10)' },
        },
        required: ['contact'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'holded_list_leads',
      description: 'Lista leads del CRM de Holded. Opcionalmente filtra por funnel. Incluye nombres de funnel/stage.',
      parameters: {
        type: 'object',
        properties: {
          funnelId: { type: 'string', description: 'ID del funnel para filtrar (opcional)' },
          page: { type: 'number', description: 'Pagina (default 1)' },
          limit: { type: 'number', description: 'Items por pagina (default 25)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'holded_create_lead',
      description: 'Crea un nuevo lead en el CRM de Holded.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nombre del lead' },
          contact: { type: 'string', description: 'Nombre o ID del contacto asociado (opcional)' },
          funnelId: { type: 'string', description: 'ID del funnel (opcional, usa el primero por defecto)' },
          stageId: { type: 'string', description: 'ID del stage (opcional, usa el primero del funnel)' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'holded_list_projects',
      description: 'Lista proyectos de Holded con paginacion.',
      parameters: {
        type: 'object',
        properties: {
          page: { type: 'number', description: 'Pagina (default 1)' },
          limit: { type: 'number', description: 'Items por pagina (default 25)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'holded_clock_in',
      description: 'Fichar entrada en Holded (clock in). Usa el empleado configurado con holded_set_my_employee_id.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'holded_clock_out',
      description: 'Fichar salida en Holded (clock out). Usa el empleado configurado.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'holded_list_funnels',
      description: 'Lista los funnels (pipelines) del CRM de Holded con sus stages.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  // --- Tools añadidas para canvas comerciales ---
  {
    type: 'function',
    function: {
      name: 'create_contact',
      description: 'Crea un nuevo contacto en Holded. Usar para dar de alta leads cualificados.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nombre del contacto o empresa' },
          email: { type: 'string', description: 'Email del contacto' },
          phone: { type: 'string', description: 'Telefono del contacto' },
          type: { type: 'string', description: 'Tipo: client, supplier, lead, debtor, creditor (default: lead)' },
          note: { type: 'string', description: 'Nota inicial del contacto (fuente, contexto)' },
          tradename: { type: 'string', description: 'Nombre comercial (opcional)' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_contact',
      description: 'Actualiza un contacto existente en Holded (nombre, email, telefono, tipo, nota).',
      parameters: {
        type: 'object',
        properties: {
          contactId: { type: 'string', description: 'ID del contacto en Holded' },
          name: { type: 'string', description: 'Nuevo nombre (opcional)' },
          email: { type: 'string', description: 'Nuevo email (opcional)' },
          phone: { type: 'string', description: 'Nuevo telefono (opcional)' },
          type: { type: 'string', description: 'Nuevo tipo: client, supplier, lead (opcional)' },
          note: { type: 'string', description: 'Nota a añadir (opcional)' },
        },
        required: ['contactId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_contacts',
      description: 'Lista contactos de Holded con paginacion. Usar para descargar cache de clientes existentes.',
      parameters: {
        type: 'object',
        properties: {
          page: { type: 'number', description: 'Pagina (default 1)' },
          limit: { type: 'number', description: 'Items por pagina (max 500, default 50)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'holded_update_lead',
      description: 'Actualiza un lead del CRM: cambiar etapa, valor, estado (0=abierto, 1=ganado, 2=perdido).',
      parameters: {
        type: 'object',
        properties: {
          leadId: { type: 'string', description: 'ID del lead en Holded' },
          stageId: { type: 'string', description: 'ID o nombre de la nueva etapa (opcional)' },
          value: { type: 'number', description: 'Valor monetario del lead (opcional)' },
          status: { type: 'number', description: '0=abierto, 1=ganado, 2=perdido (opcional)' },
          name: { type: 'string', description: 'Nuevo nombre del lead (opcional)' },
        },
        required: ['leadId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'holded_create_lead_note',
      description: 'Añade una nota a un lead del CRM. Usar para registrar interacciones (emails enviados, respuestas).',
      parameters: {
        type: 'object',
        properties: {
          leadId: { type: 'string', description: 'ID del lead' },
          title: { type: 'string', description: 'Titulo de la nota' },
          desc: { type: 'string', description: 'Descripcion/contenido de la nota' },
        },
        required: ['leadId', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'holded_search_lead',
      description: 'Busca leads en el CRM por nombre o contacto. Busqueda fuzzy.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Texto de busqueda (nombre del lead o contacto)' },
          funnelId: { type: 'string', description: 'ID del funnel para filtrar (opcional)' },
        },
        required: ['query'],
      },
    },
  },
];

// ─── MCP invocation helper ───

async function callHoldedMcp(toolName: string, toolArgs: Record<string, unknown>): Promise<unknown> {
  if (!HOLDED_MCP_URL) {
    throw new Error('HOLDED_MCP_URL no configurado. Configura la variable de entorno para conectar con Holded MCP.');
  }

  const response = await fetch(HOLDED_MCP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: toolName, arguments: toolArgs },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Holded MCP HTTP ${response.status}: ${errText.substring(0, 500)}`);
  }

  // Parse SSE or JSON response from MCP server
  const body = await response.text();
  let parsed;
  if (body.startsWith('event:') || (response.headers.get('content-type') || '').includes('text/event-stream')) {
    const dataLine = body.split('\n').find(l => l.startsWith('data: '));
    parsed = dataLine ? JSON.parse(dataLine.slice(6)) : JSON.parse(body);
  } else {
    parsed = JSON.parse(body);
  }

  if (parsed.error) {
    throw new Error(`Holded MCP error: ${parsed.error.message || JSON.stringify(parsed.error)}`);
  }

  // MCP returns content as array of {type, text}
  const content = parsed.result?.content;
  if (Array.isArray(content) && content.length > 0 && content[0].text) {
    try {
      const text = content[0].text;
      // Truncate large results
      if (text.length > 8000) {
        const truncated = JSON.parse(text);
        return { ...truncated, _truncated: true, _note: 'Resultado truncado. Usa filtros para reducir resultados.' };
      }
      return JSON.parse(text);
    } catch {
      return content[0].text;
    }
  }

  return parsed.result || parsed;
}

// ─── Public API ───

export function isHoldedTool(name: string): boolean {
  return HOLDED_TOOLS.some(t => t.function.name === name);
}

export function getHoldedTools(): CatBotTool[] {
  if (!HOLDED_MCP_URL) return [];
  return HOLDED_TOOLS;
}

export async function executeHoldedTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
  try {
    const result = await callHoldedMcp(name, args);
    logger.info('catbot', `Holded tool executed: ${name}`, { tool: name });
    return {
      name,
      result,
      actions: [{ type: 'navigate', url: '/connectors', label: 'Ver Holded en Conectores →' }],
    };
  } catch (err) {
    logger.error('catbot', `Holded tool error: ${name}`, { error: (err as Error).message });
    return {
      name,
      result: { error: (err as Error).message },
    };
  }
}
