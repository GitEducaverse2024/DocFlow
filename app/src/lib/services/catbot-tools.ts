import db from '@/lib/db';

export interface CatBotTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCallResult {
  name: string;
  result: unknown;
  actions?: Array<{ type: string; url: string; label: string }>;
}

const TOOLS: CatBotTool[] = [
  {
    type: 'function',
    function: {
      name: 'create_catbrain',
      description: 'Crea un nuevo CatBrain en DoCatFlow',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nombre del CatBrain' },
          purpose: { type: 'string', description: 'Proposito o descripcion del CatBrain' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_catbrains',
      description: 'Lista todos los CatBrains existentes en DoCatFlow',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_cat_paw',
      description: 'Crea un CatPaw (agente unificado) en DoCatFlow. Un CatPaw puede ser chat, procesador o hibrido.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nombre del CatPaw' },
          description: { type: 'string', description: 'Descripcion de lo que hace el CatPaw' },
          mode: { type: 'string', enum: ['chat', 'processor', 'hybrid'], description: 'Modo operativo (default: chat)' },
          model: { type: 'string', description: 'Modelo LLM a usar (default: gemini-main)' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_cat_paws',
      description: 'Lista los CatPaws (agentes unificados). Puede filtrar por modo (chat, processor, hybrid).',
      parameters: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: ['chat', 'processor', 'hybrid'], description: 'Filtrar por modo operativo' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_task',
      description: 'Crea una nueva tarea en DoCatFlow',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nombre de la tarea' },
          description: { type: 'string', description: 'Descripcion de la tarea' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: 'Lista todas las tareas existentes',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_connector',
      description: 'Crea un conector para integracion externa',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nombre del conector' },
          type: { type: 'string', enum: ['n8n_webhook', 'http_api', 'mcp_server', 'email'], description: 'Tipo de conector' },
          config: { type: 'object', description: 'Configuracion del conector (url, headers, etc)' },
        },
        required: ['name', 'type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_system_status',
      description: 'Obtiene el estado de los servicios del sistema (OpenClaw, n8n, Qdrant, LiteLLM)',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_dashboard',
      description: 'Obtiene un resumen del dashboard con metricas de la plataforma',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate_to',
      description: 'Genera un boton para que el usuario navegue a una pagina de DoCatFlow',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL relativa (ej: /catbrains, /agents, /tasks/new)' },
          label: { type: 'string', description: 'Texto del boton' },
        },
        required: ['url', 'label'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'explain_feature',
      description: 'Explica una funcionalidad de DoCatFlow al usuario',
      parameters: {
        type: 'object',
        properties: {
          feature: { type: 'string', description: 'Nombre de la funcionalidad a explicar' },
        },
        required: ['feature'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_documentation',
      description: 'Busca en la documentacion del proyecto (archivos .md de progreso, planning, README) para responder preguntas sobre el estado actual, decisiones tecnicas, errores conocidos y roadmap',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'La pregunta o termino a buscar en la documentacion' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_error_history',
      description: 'Lee el historial de los ultimos 10 errores capturados por el interceptor de errores de la aplicacion',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_email_connectors',
      description: 'Lista los conectores de email Gmail configurados y activos en DoCatFlow',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_email',
      description: 'Envia un email usando un conector Gmail configurado. IMPORTANTE: Siempre confirma con el usuario antes de ejecutar esta herramienta.',
      parameters: {
        type: 'object',
        properties: {
          connector_name: { type: 'string', description: 'Nombre del conector Gmail a usar' },
          to: { type: 'string', description: 'Email destinatario' },
          subject: { type: 'string', description: 'Asunto del email' },
          body: { type: 'string', description: 'Cuerpo del email (texto)' },
        },
        required: ['connector_name', 'to', 'subject', 'body'],
      },
    },
  },
];

function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const FEATURE_KNOWLEDGE: Record<string, string> = {
  'catbrains': 'Los **CatBrains** son el nucleo de DoCatFlow. Subes documentos (PDF, URLs, YouTube, notas), los procesas con IA para generar documentos estructurados, y luego indexas el resultado en un RAG para poder chatear con el contenido.',
  'proyectos': 'Los **CatBrains** (antes llamados Proyectos) son el nucleo de DoCatFlow. Subes documentos, los procesas con IA, y los indexas en RAG.',
  'agentes': 'Los **Agentes** (CatPaws) son entidades unificadas con 3 modos: chat (conversacionales), processor (procesadores de documentos), e hybrid (ambos). Se crean en /agents y se pueden vincular a CatBrains, conectores y skills.',
  'tareas': 'Las **Tareas** son pipelines multi-agente. Defines una secuencia de pasos (agente, checkpoint humano, sintesis) que se ejecutan secuencialmente. Cada agente puede usar RAG y skills.',
  'conectores': 'Los **Conectores** permiten integrar DoCatFlow con servicios externos: n8n webhooks, APIs HTTP, servidores MCP, y email. Se ejecutan antes o despues de cada paso en un pipeline.',
  'rag': 'El **RAG** (Retrieval-Augmented Generation) indexa documentos procesados en vectores (Qdrant + Ollama embeddings) para que puedas hacer preguntas en lenguaje natural sobre el contenido.',
  'workers': 'Los **Docs Workers** han sido migrados a CatPaws con modo procesador. Visita /agents?mode=processor para ver los procesadores.',
  'catpaws': 'Los **Agentes** (CatPaws) son entidades unificadas con 3 modos: chat (conversacionales), processor (procesadores de documentos), e hybrid (ambos). Se crean en /agents y se pueden vincular a CatBrains, conectores y skills.',
  'skills': 'Las **Skills** son habilidades reutilizables que se inyectan en el procesamiento de documentos o en los pasos de tareas. Tienen instrucciones, templates, y restricciones.',
  'dashboard': 'El **Dashboard** muestra metricas de la plataforma: proyectos, agentes, tareas, tokens usados, costes, actividad reciente, y uso de almacenamiento.',
  'mcp': 'El protocolo **MCP** (Model Context Protocol) permite exponer los RAGs de DoCatFlow como servidores que otros agentes (OpenClaw, OpenHands, etc.) pueden consultar.',
  'openclaw': '**OpenClaw** es un gateway de agentes IA. DoCatFlow registra agentes en OpenClaw para que sean accesibles via chat (incluido Telegram).',
  'linkedin': 'El **Conector LinkedIn MCP** (en /connectors) permite a los agentes consultar perfiles de personas, empresas y ofertas de empleo en LinkedIn. Usa rate limiting integrado (max 30 consultas/hora). Requiere servicio systemd activo en el host (puerto 8765) y autenticacion previa con la cuenta LinkedIn dedicada. Solo para uso personal — no usar para scraping masivo.',
  'searxng': 'El **SearXNG** (en Estado del Sistema y /connectors) es un metabuscador self-hosted que agrega resultados de Google, Brave, DuckDuckGo y Wikipedia. Corre como contenedor Docker en puerto 8080. No requiere API key. Busqueda 100% local. El conector seed-searxng permite usarlo desde tareas y canvas.',
  'websearch': 'La **Busqueda Web** en DoCatFlow usa dos motores: SearXNG (local, metabuscador self-hosted en puerto 8080) y Gemini Search (cloud, via LiteLLM grounding). Ambos aparecen como conectores en /connectors. SearXNG es 100% local sin API key; Gemini requiere el modelo gemini-search en LiteLLM.',
  'default': 'DoCatFlow es una plataforma de Document Intelligence. Permite subir documentos, procesarlos con IA, crear asistentes RAG, configurar agentes especializados, crear tareas multi-agente, y conectar con servicios externos.',
};

export function getTools(): CatBotTool[] {
  return TOOLS;
}

export function getToolsForLLM(allowedActions?: string[]): CatBotTool[] {
  if (!allowedActions) return TOOLS;
  return TOOLS.filter(t => {
    const name = t.function.name;
    if (name === 'navigate_to' || name === 'explain_feature' || name.startsWith('list_') || name.startsWith('get_')) return true;
    if (name === 'create_catbrain' && allowedActions.includes('create_catbrains')) return true;
    if (name === 'create_cat_paw' && allowedActions.includes('create_agents')) return true;
    if (name === 'create_task' && allowedActions.includes('create_tasks')) return true;
    if (name === 'create_connector' && allowedActions.includes('create_connectors')) return true;
    if (name === 'send_email' && allowedActions.includes('send_emails')) return true;
    if (name === 'send_email' && !allowedActions.length) return true;
    return false;
  });
}

export async function executeTool(name: string, args: Record<string, unknown>, baseUrl: string): Promise<ToolCallResult> {
  switch (name) {
    case 'create_catbrain': {
      const id = generateId();
      const now = new Date().toISOString();
      db.prepare(
        'INSERT INTO catbrains (id, name, purpose, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(id, args.name, args.purpose || '', 'draft', now, now);
      return {
        name,
        result: { id, name: args.name, status: 'draft' },
        actions: [{ type: 'navigate', url: `/catbrains/${id}`, label: `Ir al CatBrain ${args.name} →` }],
      };
    }

    case 'list_catbrains': {
      const catbrains = db.prepare(
        'SELECT id, name, status, created_at FROM catbrains ORDER BY updated_at DESC LIMIT 10'
      ).all();
      return { name, result: catbrains };
    }

    case 'create_agent':
    case 'create_cat_paw': {
      const id = generateId();
      const now = new Date().toISOString();
      const mode = (args.mode as string) || 'chat';
      db.prepare(
        'INSERT INTO cat_paws (id, name, avatar_emoji, mode, model, description, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)'
      ).run(id, args.name, '🐾', mode, args.model || 'gemini-main', args.description || '', now, now);
      return {
        name,
        result: { id, name: args.name, mode, model: args.model || 'gemini-main' },
        actions: [{ type: 'navigate', url: '/agents', label: 'Ver CatPaws →' }],
      };
    }

    case 'list_workers':
    case 'list_agents':
    case 'list_cat_paws': {
      let query = 'SELECT id, name, avatar_emoji, mode, model, is_active, description FROM cat_paws';
      const params: string[] = [];
      if (args.mode) {
        query += ' WHERE mode = ?';
        params.push(args.mode as string);
      }
      query += ' ORDER BY updated_at DESC LIMIT 15';
      const catPaws = params.length > 0
        ? db.prepare(query).all(...params)
        : db.prepare(query).all();
      return { name, result: catPaws };
    }

    case 'create_task': {
      const id = generateId();
      const now = new Date().toISOString();
      db.prepare(
        'INSERT INTO tasks (id, name, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(id, args.name, args.description || '', 'draft', now, now);
      return {
        name,
        result: { id, name: args.name, status: 'draft' },
        actions: [{ type: 'navigate', url: `/tasks/${id}`, label: `Ir a la tarea →` }],
      };
    }

    case 'list_tasks': {
      const tasks = db.prepare(
        'SELECT id, name, status, created_at FROM tasks ORDER BY updated_at DESC LIMIT 10'
      ).all();
      return { name, result: tasks };
    }

    case 'create_connector': {
      const id = generateId();
      const now = new Date().toISOString();
      db.prepare(
        'INSERT INTO connectors (id, name, type, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(id, args.name, args.type, JSON.stringify(args.config || {}), now, now);
      return {
        name,
        result: { id, name: args.name, type: args.type },
        actions: [{ type: 'navigate', url: '/connectors', label: 'Ver conectores →' }],
      };
    }

    case 'get_system_status': {
      try {
        const res = await fetch(`${baseUrl}/api/health`);
        const data = await res.json();
        return { name, result: data };
      } catch {
        return { name, result: { error: 'No se pudo obtener el estado del sistema' } };
      }
    }

    case 'get_dashboard': {
      try {
        const res = await fetch(`${baseUrl}/api/dashboard/summary`);
        const data = await res.json();
        return { name, result: data };
      } catch {
        return { name, result: { error: 'No se pudo obtener el dashboard' } };
      }
    }

    case 'navigate_to': {
      return {
        name,
        result: { navigating: true },
        actions: [{ type: 'navigate', url: args.url as string, label: args.label as string }],
      };
    }

    case 'explain_feature': {
      const feature = (args.feature as string || '').toLowerCase();
      let explanation = FEATURE_KNOWLEDGE['default'];
      for (const [key, value] of Object.entries(FEATURE_KNOWLEDGE)) {
        if (feature.includes(key)) {
          explanation = value;
          break;
        }
      }
      return { name, result: { explanation } };
    }

    case 'search_documentation': {
      try {
        const res = await fetch(`${baseUrl}/api/catbot/search-docs?q=${encodeURIComponent(args.query as string)}`);
        const data = await res.json();
        return { name, result: data.results || [] };
      } catch {
        return { name, result: { error: 'No se pudo buscar en la documentacion' } };
      }
    }

    case 'read_error_history': {
      try {
        const res = await fetch(`${baseUrl}/api/catbot/error-history`);
        const data = await res.json();
        return { name, result: data.errors || [] };
      } catch {
        return { name, result: { error: 'No se pudo leer el historial de errores' } };
      }
    }

    case 'list_email_connectors': {
      try {
        const connectors = db.prepare(
          'SELECT id, name, type, gmail_subtype, is_active, test_status FROM connectors WHERE type = \'gmail\' AND is_active = 1'
        ).all() as Array<{ id: string; name: string; gmail_subtype: string | null; test_status: string | null }>;
        if (connectors.length === 0) {
          return { name, result: { message: 'No hay conectores Gmail activos configurados.' } };
        }
        return {
          name,
          result: connectors.map(c => ({ id: c.id, name: c.name, gmail_subtype: c.gmail_subtype, test_status: c.test_status })),
          actions: [{ type: 'navigate', url: '/connectors', label: 'Ver conectores →' }],
        };
      } catch {
        return { name, result: { error: 'No se pudo consultar los conectores Gmail' } };
      }
    }

    case 'send_email': {
      try {
        const connectorName = args.connector_name as string;
        const to = args.to as string;
        const subject = args.subject as string;
        const body = args.body as string;

        // Try exact match first
        let connector = db.prepare(
          'SELECT id, name FROM connectors WHERE type = \'gmail\' AND is_active = 1 AND name = ?'
        ).get(connectorName) as { id: string; name: string } | undefined;

        // Fallback to LIKE search
        if (!connector) {
          connector = db.prepare(
            'SELECT id, name FROM connectors WHERE type = \'gmail\' AND is_active = 1 AND name LIKE ?'
          ).get(`%${connectorName}%`) as { id: string; name: string } | undefined;
        }

        if (!connector) {
          return { name, result: { sent: false, error: `No se encontro conector Gmail con nombre '${connectorName}'` } };
        }

        const invokeRes = await fetch(`${baseUrl}/api/connectors/${connector.id}/invoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ output: JSON.stringify({ to, subject, text_body: body }) }),
        });

        if (!invokeRes.ok) {
          const errText = await invokeRes.text();
          return {
            name,
            result: { sent: false, error: errText },
            actions: [{ type: 'navigate', url: '/connectors', label: 'Ver conectores →' }],
          };
        }

        return {
          name,
          result: { sent: true, to, subject, connector: connector.name },
          actions: [{ type: 'navigate', url: '/connectors', label: 'Ver conectores →' }],
        };
      } catch (err) {
        return {
          name,
          result: { sent: false, error: (err as Error).message },
          actions: [{ type: 'navigate', url: '/connectors', label: 'Ver conectores →' }],
        };
      }
    }

    default:
      return { name, result: { error: `Tool ${name} no encontrado` } };
  }
}
