import db from '@/lib/db';
import { getHoldedTools } from './catbot-holded-tools';

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
          department: { type: 'string', enum: ['direction', 'business', 'marketing', 'finance', 'production', 'logistics', 'hr', 'personal', 'other'], description: 'Departamento del CatPaw (default: other). direction=Direccion, business=Negocio, marketing=Marketing, finance=Finanzas, production=Produccion, logistics=Logistica, hr=RRHH, personal=Personal, other=Otros' },
          mode: { type: 'string', enum: ['chat', 'processor', 'hybrid'], description: 'Modo operativo (default: chat)' },
          model: { type: 'string', description: 'Modelo LLM a usar (default: gemini-main)' },
          system_prompt: { type: 'string', description: 'Prompt de sistema completo que define el comportamiento del CatPaw. OBLIGATORIO para CatPaws de pipeline.' },
          temperature: { type: 'number', description: 'Temperatura del modelo (0.0-1.0). Clasificacion=0.1, gestion=0.2, redaccion-intermedia=0.4, redaccion-final=0.5' },
          output_format: { type: 'string', enum: ['json', 'md', 'markdown'], description: 'Formato de salida. json si hay nodo despues, md/markdown si es nodo final' },
          max_tokens: { type: 'number', description: 'Tokens maximos de respuesta (default: 4096)' },
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
      name: 'list_catflows',
      description: 'Lista todos los CatFlows (tareas) con su estado, modo de escucha y programacion',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_catflow',
      description: 'Ejecuta un CatFlow por nombre o ID. IMPORTANTE: Confirma con el usuario antes de ejecutar.',
      parameters: {
        type: 'object',
        properties: {
          identifier: { type: 'string', description: 'Nombre o ID del CatFlow a ejecutar' },
        },
        required: ['identifier'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'toggle_catflow_listen',
      description: 'Activa o desactiva el modo escucha (listen_mode) de un CatFlow',
      parameters: {
        type: 'object',
        properties: {
          identifier: { type: 'string', description: 'Nombre o ID del CatFlow' },
          enable: { type: 'boolean', description: 'true para activar, false para desactivar' },
        },
        required: ['identifier', 'enable'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fork_catflow',
      description: 'Duplica un CatFlow existente con un nuevo nombre (copia la tarea y todos sus pasos)',
      parameters: {
        type: 'object',
        properties: {
          identifier: { type: 'string', description: 'Nombre o ID del CatFlow a duplicar' },
          new_name: { type: 'string', description: 'Nombre para la copia' },
        },
        required: ['identifier', 'new_name'],
      },
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
  // ─── Skill Tools ───
  {
    type: 'function',
    function: {
      name: 'get_skill',
      description: 'Busca y devuelve una skill por nombre o ID. Devuelve las instrucciones completas, constraints y metadata.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nombre (o parte del nombre) de la skill a buscar' },
          skillId: { type: 'string', description: 'ID exacto de la skill' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_skills',
      description: 'Lista todas las skills disponibles con su categoria, descripcion y tags. Usar ANTES de crear o configurar un CatPaw para saber que skills existen y cuales recomendar.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['writing', 'analysis', 'strategy', 'technical', 'format'], description: 'Filtrar por categoria (opcional)' },
        },
      },
    },
  },
  // ─── CatPaw Inspection & Update Tools ───
  {
    type: 'function',
    function: {
      name: 'get_cat_paw',
      description: 'Obtiene el detalle completo de un CatPaw por ID o nombre, incluyendo system_prompt, temperature, output_format, conectores vinculados, skills vinculadas y CatBrains vinculados. Usar ANTES de decidir si un CatPaw existente sirve para una tarea.',
      parameters: {
        type: 'object',
        properties: {
          catPawId: { type: 'string', description: 'ID del CatPaw a inspeccionar' },
          catPawName: { type: 'string', description: 'Nombre del CatPaw (busca por nombre si no se pasa catPawId)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_cat_paw',
      description: 'Actualiza la configuracion de un CatPaw existente. Usar para corregir system_prompt vacio, temperatura incorrecta, output_format erroneo, o cualquier campo.',
      parameters: {
        type: 'object',
        properties: {
          catPawId: { type: 'string', description: 'ID del CatPaw a actualizar' },
          system_prompt: { type: 'string', description: 'Nuevo system prompt' },
          temperature: { type: 'number', description: 'Nueva temperatura (0.0-1.0)' },
          output_format: { type: 'string', enum: ['json', 'md', 'markdown'], description: 'Formato de salida' },
          max_tokens: { type: 'number', description: 'Maximo de tokens en la respuesta' },
          name: { type: 'string', description: 'Nuevo nombre' },
          description: { type: 'string', description: 'Nueva descripcion' },
          mode: { type: 'string', enum: ['chat', 'processor', 'hybrid'], description: 'Nuevo modo operativo' },
        },
        required: ['catPawId'],
      },
    },
  },
  // ─── CatPaw Linking Tools ───
  {
    type: 'function',
    function: {
      name: 'link_connector_to_catpaw',
      description: 'Vincula un conector existente a un CatPaw. Sin esto, el CatPaw no tiene acceso al servicio externo aunque su system_prompt lo mencione.',
      parameters: {
        type: 'object',
        properties: {
          catpaw_id: { type: 'string', description: 'ID del CatPaw' },
          connector_id: { type: 'string', description: 'ID del conector a vincular' },
          usage_hint: { type: 'string', description: 'Descripcion de para que usa el conector este CatPaw' },
        },
        required: ['catpaw_id', 'connector_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'link_skill_to_catpaw',
      description: 'Vincula una skill existente a un CatPaw. La skill se inyecta automaticamente cuando el CatPaw se ejecuta.',
      parameters: {
        type: 'object',
        properties: {
          catpaw_id: { type: 'string', description: 'ID del CatPaw' },
          skill_id: { type: 'string', description: 'ID de la skill a vincular' },
        },
        required: ['catpaw_id', 'skill_id'],
      },
    },
  },
  // ─── Canvas Tools ───
  {
    type: 'function',
    function: {
      name: 'canvas_list',
      description: 'Lista todos los canvas disponibles con nombre, modo y numero de nodos',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_get',
      description: 'Obtiene el detalle completo de un canvas incluyendo todos sus nodos y conexiones',
      parameters: {
        type: 'object',
        properties: {
          canvasId: { type: 'string', description: 'ID del canvas' },
          canvasName: { type: 'string', description: 'Nombre del canvas (busca por nombre si no se pasa canvasId)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_create',
      description: 'Crea un nuevo canvas vacio con nodo START incluido',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nombre del canvas' },
          mode: { type: 'string', enum: ['agents', 'projects', 'mixed'], description: 'Modo del canvas (default: mixed)' },
          description: { type: 'string', description: 'Descripcion del canvas' },
          emoji: { type: 'string', description: 'Emoji del canvas' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_add_node',
      description: 'Anade un nodo nuevo a un canvas existente',
      parameters: {
        type: 'object',
        properties: {
          canvasId: { type: 'string', description: 'ID del canvas' },
          nodeType: { type: 'string', enum: ['AGENT', 'PROJECT', 'CONNECTOR', 'CHECKPOINT', 'MERGE', 'CONDITION', 'OUTPUT'], description: 'Tipo de nodo' },
          label: { type: 'string', description: 'Nombre visible del nodo' },
          agentId: { type: 'string', description: 'ID del agente (para nodos AGENT)' },
          connectorId: { type: 'string', description: 'ID del conector (para nodos CONNECTOR)' },
          instructions: { type: 'string', description: 'Instrucciones del nodo' },
          positionX: { type: 'number', description: 'Posicion X en el canvas' },
          positionY: { type: 'number', description: 'Posicion Y en el canvas' },
        },
        required: ['canvasId', 'nodeType', 'label'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_add_edge',
      description: 'Conecta dos nodos en el canvas con una arista (edge)',
      parameters: {
        type: 'object',
        properties: {
          canvasId: { type: 'string', description: 'ID del canvas' },
          sourceNodeId: { type: 'string', description: 'ID del nodo origen' },
          targetNodeId: { type: 'string', description: 'ID del nodo destino' },
          sourceHandle: { type: 'string', description: 'Handle de salida (para CONDITION: yes/no)' },
        },
        required: ['canvasId', 'sourceNodeId', 'targetNodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_remove_node',
      description: 'Elimina un nodo del canvas y todos sus edges asociados',
      parameters: {
        type: 'object',
        properties: {
          canvasId: { type: 'string', description: 'ID del canvas' },
          nodeId: { type: 'string', description: 'ID del nodo a eliminar' },
        },
        required: ['canvasId', 'nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_update_node',
      description: 'Actualiza la configuracion de un nodo existente (instrucciones, agente, conector, label, skills)',
      parameters: {
        type: 'object',
        properties: {
          canvasId: { type: 'string', description: 'ID del canvas' },
          nodeId: { type: 'string', description: 'ID del nodo a actualizar' },
          label: { type: 'string', description: 'Nuevo nombre visible' },
          agentId: { type: 'string', description: 'Nuevo ID de agente' },
          connectorId: { type: 'string', description: 'Nuevo ID de conector' },
          instructions: { type: 'string', description: 'Nuevas instrucciones' },
          skills: { type: 'array', items: { type: 'string' }, description: 'Array de IDs de skills a vincular al nodo' },
        },
        required: ['canvasId', 'nodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_execute',
      description: 'Ejecuta un canvas y devuelve el runId para seguimiento',
      parameters: {
        type: 'object',
        properties: {
          canvasId: { type: 'string', description: 'ID del canvas a ejecutar' },
          input: { type: 'string', description: 'Input inicial para el nodo START' },
        },
        required: ['canvasId'],
      },
    },
  },
  // ─── Canvas Run Inspection Tools ───
  {
    type: 'function',
    function: {
      name: 'canvas_list_runs',
      description: 'Lista los ultimos runs (ejecuciones) de un canvas con su estado, timestamps y tokens usados. Util para saber que ejecuciones existen antes de pedir detalle.',
      parameters: {
        type: 'object',
        properties: {
          canvasId: { type: 'string', description: 'ID del canvas' },
          canvasName: { type: 'string', description: 'Nombre del canvas (busca por nombre si no se pasa canvasId)' },
          limit: { type: 'number', description: 'Numero maximo de runs a devolver (default: 10)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_get_run',
      description: 'Obtiene el detalle completo de una ejecucion de canvas incluyendo el output de cada nodo (node_states). Si no se pasa runId, devuelve el run mas reciente automaticamente.',
      parameters: {
        type: 'object',
        properties: {
          canvasId: { type: 'string', description: 'ID del canvas' },
          canvasName: { type: 'string', description: 'Nombre del canvas (busca por nombre si no se pasa canvasId)' },
          runId: { type: 'string', description: 'ID del run. Si no se pasa, devuelve el mas reciente' },
        },
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
  'holded': 'El **Conector Holded MCP** integra el ERP Holded con DoCatFlow. Puedes pedirme directamente:\n' +
    '- **Contactos**: "busca el contacto Acme" (holded_search_contact), "dame el contexto de Acme" (holded_contact_context)\n' +
    '- **Facturas**: "crea factura para Acme" (holded_quick_invoice), "lista facturas de Acme" (holded_list_invoices)\n' +
    '- **CRM**: "lista los leads" (holded_list_leads), "crea un lead" (holded_create_lead), "lista los funnels" (holded_list_funnels)\n' +
    '- **Proyectos**: "lista proyectos de Holded" (holded_list_projects)\n' +
    '- **Fichaje**: "ficha mi entrada" (holded_clock_in), "ficha mi salida" (holded_clock_out)\n' +
    'Para acceso avanzado a las ~60 herramientas, usa modo sudo + mcp_bridge. Servicio en puerto 8766. Ver estado en /system.',
  'searxng': 'El **SearXNG** (en Estado del Sistema y /connectors) es un metabuscador self-hosted que agrega resultados de Google, Brave, DuckDuckGo y Wikipedia. Corre como contenedor Docker en puerto 8080. No requiere API key. Busqueda 100% local. El conector seed-searxng permite usarlo desde tareas y canvas.',
  'websearch': 'La **Busqueda Web** en DoCatFlow usa dos motores: SearXNG (local, metabuscador self-hosted en puerto 8080) y Gemini Search (cloud, via LiteLLM grounding). Ambos aparecen como conectores en /connectors. SearXNG es 100% local sin API key; Gemini requiere el modelo gemini-search en LiteLLM.',
  'catflow': 'Los **CatFlows** son pipelines visuales multi-agente. Puedes crearlos en /catflow, conectar nodos (agentes, almacenamiento, scheduler, multiagent), y ejecutarlos. Los CatFlows pueden escuchar senales de otros CatFlows (modo escucha) y activarse automaticamente.',
  'default': 'DoCatFlow es una plataforma de Document Intelligence. Permite subir documentos, procesarlos con IA, crear asistentes RAG, configurar agentes especializados, crear tareas multi-agente, y conectar con servicios externos.',
};

export function getTools(): CatBotTool[] {
  return TOOLS;
}

export function getToolsForLLM(allowedActions?: string[]): CatBotTool[] {
  const holdedTools = getHoldedTools();
  const allTools = [...TOOLS, ...holdedTools];
  if (!allowedActions) return allTools;
  return allTools.filter(t => {
    const name = t.function.name;
    // Holded tools are always allowed (read + write via MCP)
    if (name.startsWith('holded_')) return true;
    if (name === 'navigate_to' || name === 'explain_feature' || name.startsWith('list_') || name.startsWith('get_')
      || name === 'execute_catflow' || name === 'toggle_catflow_listen' || name === 'fork_catflow'
      || name === 'canvas_list' || name === 'canvas_get' || name === 'canvas_list_runs' || name === 'canvas_get_run') return true;
    if (name === 'create_catbrain' && allowedActions.includes('create_catbrains')) return true;
    if (name === 'create_cat_paw' && allowedActions.includes('create_agents')) return true;
    if (name === 'update_cat_paw' && allowedActions.includes('create_agents')) return true;
    if (name === 'update_cat_paw' && !allowedActions.length) return true;
    if (name.startsWith('link_') && allowedActions.includes('create_agents')) return true;
    if (name.startsWith('link_') && !allowedActions.length) return true;
    if (name === 'create_task' && allowedActions.includes('create_tasks')) return true;
    if (name === 'create_connector' && allowedActions.includes('create_connectors')) return true;
    if (name.startsWith('canvas_') && allowedActions.includes('manage_canvas')) return true;
    if (name.startsWith('canvas_') && !allowedActions.length) return true;
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
      const department = (args.department as string) || 'other';
      const temperature = args.temperature !== undefined ? Number(args.temperature) : 0.7;
      const maxTokens = args.max_tokens !== undefined ? Number(args.max_tokens) : 4096;
      const outputFormat = (args.output_format as string) || 'md';
      db.prepare(
        `INSERT INTO cat_paws (id, name, avatar_emoji, mode, model, department, description, system_prompt, temperature, max_tokens, output_format, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      ).run(id, args.name, '🐾', mode, args.model || 'gemini-main', department, args.description || '', args.system_prompt || null, temperature, maxTokens, outputFormat, now, now);
      return {
        name,
        result: { id, name: args.name, mode, department, model: args.model || 'gemini-main', temperature, output_format: outputFormat, max_tokens: maxTokens, has_system_prompt: !!args.system_prompt },
        actions: [{ type: 'navigate', url: '/agents', label: 'Ver CatPaws →' }],
      };
    }

    case 'list_workers':
    case 'list_agents':
    case 'list_cat_paws': {
      let query = `SELECT cp.id, cp.name, cp.avatar_emoji, cp.mode, cp.model, cp.department, cp.is_active, cp.description,
        (SELECT GROUP_CONCAT(s.name, ', ') FROM cat_paw_skills cps JOIN skills s ON s.id = cps.skill_id WHERE cps.paw_id = cp.id) as linked_skills
        FROM cat_paws cp`;
      const params: string[] = [];
      if (args.mode) {
        query += ' WHERE cp.mode = ?';
        params.push(args.mode as string);
      }
      query += ' ORDER BY cp.updated_at DESC LIMIT 20';
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

    case 'list_catflows': {
      const catflows = db.prepare(
        'SELECT id, name, status, listen_mode, mode, created_at FROM canvases WHERE is_template = 0 ORDER BY updated_at DESC LIMIT 20'
      ).all();
      return {
        name,
        result: catflows,
        actions: [{ type: 'navigate', url: '/catflow', label: 'Ver CatFlows \u2192' }],
      };
    }

    case 'execute_catflow': {
      const identifier = args.identifier as string;
      type TaskRow = { id: string; name: string; status: string };
      let task: TaskRow | undefined;

      // Try by ID first
      task = db.prepare('SELECT id, name, status FROM tasks WHERE id = ?').get(identifier) as TaskRow | undefined;
      // Try by exact name
      if (!task) {
        task = db.prepare('SELECT id, name, status FROM tasks WHERE name = ?').get(identifier) as TaskRow | undefined;
      }
      // Try by LIKE
      if (!task) {
        task = db.prepare('SELECT id, name, status FROM tasks WHERE name LIKE ?').get(`%${identifier}%`) as TaskRow | undefined;
      }

      if (!task) {
        return { name, result: { error: `No se encontro CatFlow con identificador '${identifier}'` } };
      }

      try {
        const res = await fetch(`${baseUrl}/api/tasks/${task.id}/execute`, { method: 'POST' });
        if (!res.ok) {
          const errText = await res.text();
          return { name, result: { error: `Error al ejecutar CatFlow '${task.name}': ${errText}` } };
        }
        return {
          name,
          result: { executed: true, task_id: task.id, task_name: task.name, previous_status: task.status },
          actions: [{ type: 'navigate', url: '/catflow', label: 'Ver CatFlows \u2192' }],
        };
      } catch (err) {
        return { name, result: { error: `Error al ejecutar CatFlow '${task.name}': ${(err as Error).message}` } };
      }
    }

    case 'toggle_catflow_listen': {
      const identifier = args.identifier as string;
      const enable = args.enable as boolean;
      type CanvasRow = { id: string; name: string; listen_mode: number };
      let canvas: CanvasRow | undefined;

      canvas = db.prepare('SELECT id, name, listen_mode FROM canvases WHERE id = ?').get(identifier) as CanvasRow | undefined;
      if (!canvas) {
        canvas = db.prepare('SELECT id, name, listen_mode FROM canvases WHERE name = ?').get(identifier) as CanvasRow | undefined;
      }
      if (!canvas) {
        canvas = db.prepare('SELECT id, name, listen_mode FROM canvases WHERE name LIKE ?').get(`%${identifier}%`) as CanvasRow | undefined;
      }

      if (!canvas) {
        return { name, result: { error: `No se encontro CatFlow con identificador '${identifier}'` } };
      }

      db.prepare('UPDATE canvases SET listen_mode = ? WHERE id = ?').run(enable ? 1 : 0, canvas.id);
      return {
        name,
        result: { canvas_id: canvas.id, canvas_name: canvas.name, listen_mode: enable },
        actions: [{ type: 'navigate', url: '/catflow', label: 'Ver CatFlows \u2192' }],
      };
    }

    case 'fork_catflow': {
      const identifier = args.identifier as string;
      const newName = args.new_name as string;
      type TaskRow = { id: string; name: string };
      let task: TaskRow | undefined;

      task = db.prepare('SELECT id, name FROM tasks WHERE id = ?').get(identifier) as TaskRow | undefined;
      if (!task) {
        task = db.prepare('SELECT id, name FROM tasks WHERE name = ?').get(identifier) as TaskRow | undefined;
      }
      if (!task) {
        task = db.prepare('SELECT id, name FROM tasks WHERE name LIKE ?').get(`%${identifier}%`) as TaskRow | undefined;
      }

      if (!task) {
        return { name, result: { error: `No se encontro CatFlow con identificador '${identifier}'` } };
      }

      try {
        const res = await fetch(`${baseUrl}/api/tasks/${task.id}/fork`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newName }),
        });
        if (!res.ok) {
          const errText = await res.text();
          return { name, result: { error: `Error al duplicar CatFlow '${task.name}': ${errText}` } };
        }
        const forked = await res.json();
        return {
          name,
          result: { forked: true, original: task.name, new_id: forked.id, new_name: newName },
          actions: [{ type: 'navigate', url: '/catflow', label: 'Ver CatFlows \u2192' }],
        };
      } catch (err) {
        return { name, result: { error: `Error al duplicar CatFlow '${task.name}': ${(err as Error).message}` } };
      }
    }

    // ─── Skill Tool Handlers ───

    case 'get_skill': {
      type SkillRow = { id: string; name: string; description: string; instructions: string; constraints: string; category: string; tags: string; version: string; author: string };
      let skill: SkillRow | undefined;

      if (args.skillId) {
        skill = db.prepare('SELECT id, name, description, instructions, constraints, category, tags, version, author FROM skills WHERE id = ?').get(args.skillId as string) as SkillRow | undefined;
      }
      if (!skill && args.name) {
        skill = db.prepare('SELECT id, name, description, instructions, constraints, category, tags, version, author FROM skills WHERE name = ?').get(args.name as string) as SkillRow | undefined;
        if (!skill) {
          skill = db.prepare('SELECT id, name, description, instructions, constraints, category, tags, version, author FROM skills WHERE name LIKE ?').get(`%${args.name}%`) as SkillRow | undefined;
        }
      }

      if (!skill) {
        return { name, result: { error: `No se encontro skill con ${args.skillId ? 'id=' + args.skillId : 'nombre=' + args.name}` } };
      }

      // Increment times_used
      db.prepare('UPDATE skills SET times_used = times_used + 1 WHERE id = ?').run(skill.id);

      return {
        name,
        result: {
          id: skill.id,
          name: skill.name,
          description: skill.description,
          category: skill.category,
          tags: skill.tags,
          version: skill.version,
          author: skill.author,
          constraints: skill.constraints,
          instructions: skill.instructions,
        },
      };
    }

    case 'list_skills': {
      let query = 'SELECT id, name, description, category, tags, source, is_featured FROM skills';
      const skillParams: string[] = [];
      if (args.category) {
        query += ' WHERE category = ?';
        skillParams.push(args.category as string);
      }
      query += ' ORDER BY category, name';
      const allSkills = skillParams.length > 0
        ? db.prepare(query).all(...skillParams)
        : db.prepare(query).all();
      return { name, result: { count: (allSkills as unknown[]).length, skills: allSkills } };
    }

    // ─── CatPaw Inspection & Update Handlers ───

    case 'get_cat_paw': {
      type PawRow = Record<string, unknown>;
      let paw: PawRow | undefined;

      if (args.catPawId) {
        paw = db.prepare('SELECT * FROM cat_paws WHERE id = ?').get(args.catPawId as string) as PawRow | undefined;
      }
      if (!paw && args.catPawName) {
        paw = db.prepare('SELECT * FROM cat_paws WHERE name = ?').get(args.catPawName as string) as PawRow | undefined;
        if (!paw) {
          paw = db.prepare('SELECT * FROM cat_paws WHERE name LIKE ?').get(`%${args.catPawName}%`) as PawRow | undefined;
        }
      }

      if (!paw) {
        return { name, result: { error: `CatPaw no encontrado: ${args.catPawId || args.catPawName}` } };
      }

      const pawId = paw.id as string;
      const connectors = db.prepare(
        `SELECT cpc.connector_id, cpc.usage_hint, cpc.is_active, cn.name as connector_name, cn.type as connector_type
         FROM cat_paw_connectors cpc LEFT JOIN connectors cn ON cn.id = cpc.connector_id WHERE cpc.paw_id = ?`
      ).all(pawId) as Array<Record<string, unknown>>;

      const skills = db.prepare(
        `SELECT cps.skill_id, s.name as skill_name FROM cat_paw_skills cps LEFT JOIN skills s ON s.id = cps.skill_id WHERE cps.paw_id = ?`
      ).all(pawId) as Array<Record<string, unknown>>;

      const catbrains = db.prepare(
        `SELECT cpc.catbrain_id, cpc.query_mode, c.name as catbrain_name FROM cat_paw_catbrains cpc LEFT JOIN catbrains c ON c.id = cpc.catbrain_id WHERE cpc.paw_id = ?`
      ).all(pawId) as Array<Record<string, unknown>>;

      return {
        name,
        result: {
          id: paw.id,
          name: paw.name,
          mode: paw.mode,
          model: paw.model,
          system_prompt: (paw.system_prompt as string) || '(vacio)',
          temperature: paw.temperature,
          output_format: paw.output_format,
          max_tokens: paw.max_tokens,
          description: paw.description,
          is_active: paw.is_active,
          connectors: connectors.map(c => ({ id: c.connector_id, name: c.connector_name, type: c.connector_type, is_active: c.is_active, usage_hint: c.usage_hint })),
          skills: skills.map(s => ({ id: s.skill_id, name: s.skill_name })),
          catbrains: catbrains.map(b => ({ id: b.catbrain_id, name: b.catbrain_name, query_mode: b.query_mode })),
        },
        actions: [{ type: 'navigate', url: `/agents/${paw.id}`, label: `Ver CatPaw ${paw.name} →` }],
      };
    }

    case 'update_cat_paw': {
      const catPawId = args.catPawId as string;
      const updateFields: Record<string, unknown> = {};
      if (args.system_prompt !== undefined) updateFields.system_prompt = args.system_prompt;
      if (args.temperature !== undefined) updateFields.temperature = args.temperature;
      if (args.output_format !== undefined) updateFields.output_format = args.output_format;
      if (args.max_tokens !== undefined) updateFields.max_tokens = args.max_tokens;
      if (args.name !== undefined) updateFields.name = args.name;
      if (args.description !== undefined) updateFields.description = args.description;
      if (args.mode !== undefined) updateFields.mode = args.mode;

      if (Object.keys(updateFields).length === 0) {
        return { name, result: { error: 'No se especificaron campos a actualizar' } };
      }

      try {
        const res = await fetch(`${baseUrl}/api/cat-paws/${catPawId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateFields),
        });
        if (!res.ok) {
          const errText = await res.text();
          return { name, result: { error: `Error al actualizar CatPaw: ${errText}` } };
        }
        const updated = await res.json() as Record<string, unknown>;
        return {
          name,
          result: { updated: true, id: updated.id, name: updated.name, fields_updated: Object.keys(updateFields) },
          actions: [{ type: 'navigate', url: `/agents/${catPawId}`, label: `Ver CatPaw →` }],
        };
      } catch (err) {
        return { name, result: { error: (err as Error).message } };
      }
    }

    // ─── CatPaw Linking Handlers ───

    case 'link_connector_to_catpaw': {
      const catpawId = args.catpaw_id as string;
      const connectorId = args.connector_id as string;

      const paw = db.prepare('SELECT id, name FROM cat_paws WHERE id = ?').get(catpawId) as { id: string; name: string } | undefined;
      if (!paw) return { name, result: { error: `CatPaw no encontrado: ${catpawId}` } };

      const connector = db.prepare('SELECT id, name FROM connectors WHERE id = ?').get(connectorId) as { id: string; name: string } | undefined;
      if (!connector) return { name, result: { error: `Conector no encontrado: ${connectorId}` } };

      try {
        db.prepare('INSERT INTO cat_paw_connectors (paw_id, connector_id, usage_hint, is_active, created_at) VALUES (?, ?, ?, 1, ?)')
          .run(catpawId, connectorId, (args.usage_hint as string) || null, new Date().toISOString());
      } catch (e) {
        if ((e as Error).message.includes('UNIQUE')) {
          return { name, result: { already_linked: true, catpaw: paw.name, connector: connector.name } };
        }
        throw e;
      }

      return {
        name,
        result: { linked: true, catpaw_id: catpawId, catpaw_name: paw.name, connector_id: connectorId, connector_name: connector.name },
      };
    }

    case 'link_skill_to_catpaw': {
      const catpawId = args.catpaw_id as string;
      const skillId = args.skill_id as string;

      const paw = db.prepare('SELECT id, name FROM cat_paws WHERE id = ?').get(catpawId) as { id: string; name: string } | undefined;
      if (!paw) return { name, result: { error: `CatPaw no encontrado: ${catpawId}` } };

      const skill = db.prepare('SELECT id, name FROM skills WHERE id = ?').get(skillId) as { id: string; name: string } | undefined;
      if (!skill) return { name, result: { error: `Skill no encontrada: ${skillId}` } };

      db.prepare('INSERT OR IGNORE INTO cat_paw_skills (paw_id, skill_id) VALUES (?, ?)').run(catpawId, skillId);

      return {
        name,
        result: { linked: true, catpaw_id: catpawId, catpaw_name: paw.name, skill_id: skillId, skill_name: skill.name },
      };
    }

    // ─── Canvas Tool Handlers ───

    case 'canvas_list': {
      try {
        const res = await fetch(`${baseUrl}/api/canvas`);
        if (!res.ok) return { name, result: { error: 'Error al listar canvas' } };
        const canvases = await res.json();
        return {
          name,
          result: canvases,
          actions: [{ type: 'navigate', url: '/canvas', label: 'Ver Canvas →' }],
        };
      } catch (err) {
        return { name, result: { error: (err as Error).message } };
      }
    }

    case 'canvas_get': {
      try {
        let canvasId = args.canvasId as string | undefined;
        const canvasName = args.canvasName as string | undefined;

        if (!canvasId && canvasName) {
          const listRes = await fetch(`${baseUrl}/api/canvas`);
          if (!listRes.ok) return { name, result: { error: 'Error al buscar canvas por nombre' } };
          const all = await listRes.json() as Array<{ id: string; name: string }>;
          const match = all.find(c => c.name.toLowerCase().includes(canvasName.toLowerCase()));
          if (!match) return { name, result: { error: `No se encontro canvas con nombre '${canvasName}'` } };
          canvasId = match.id;
        }

        if (!canvasId) return { name, result: { error: 'Se requiere canvasId o canvasName' } };

        const res = await fetch(`${baseUrl}/api/canvas/${canvasId}`);
        if (!res.ok) return { name, result: { error: 'Canvas no encontrado' } };
        const canvas = await res.json();

        let flowData = { nodes: [] as Array<Record<string, unknown>>, edges: [] as Array<Record<string, unknown>> };
        if (canvas.flow_data) {
          try { flowData = typeof canvas.flow_data === 'string' ? JSON.parse(canvas.flow_data) : canvas.flow_data; } catch { /* ignore */ }
        }

        return {
          name,
          result: {
            id: canvas.id,
            name: canvas.name,
            mode: canvas.mode,
            status: canvas.status,
            node_count: flowData.nodes.length,
            edge_count: flowData.edges.length,
            nodes: flowData.nodes.map((n: Record<string, unknown>) => ({
              id: n.id,
              type: n.type,
              label: (n.data as Record<string, unknown>)?.label,
              position: n.position,
            })),
            edges: flowData.edges.map((e: Record<string, unknown>) => ({
              id: e.id,
              source: e.source,
              target: e.target,
              sourceHandle: e.sourceHandle,
            })),
          },
          actions: [{ type: 'navigate', url: `/canvas/${canvasId}`, label: `Abrir canvas →` }],
        };
      } catch (err) {
        return { name, result: { error: (err as Error).message } };
      }
    }

    case 'canvas_create': {
      try {
        const res = await fetch(`${baseUrl}/api/canvas`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: args.name,
            mode: args.mode || 'mixed',
            description: args.description || '',
            emoji: args.emoji || '🔷',
          }),
        });
        if (!res.ok) {
          const errText = await res.text();
          return { name, result: { error: `Error al crear canvas: ${errText}` } };
        }
        const created = await res.json();
        return {
          name,
          result: { id: created.id, name: args.name },
          actions: [{ type: 'navigate', url: created.redirectUrl || `/canvas/${created.id}`, label: `Abrir canvas ${args.name} →` }],
        };
      } catch (err) {
        return { name, result: { error: (err as Error).message } };
      }
    }

    case 'canvas_add_node': {
      try {
        const canvasId = args.canvasId as string;
        // Read flow_data directly from DB to avoid race conditions
        const canvasRow = db.prepare('SELECT id, flow_data FROM canvases WHERE id = ?').get(canvasId) as { id: string; flow_data: string | null } | undefined;
        if (!canvasRow) return { name, result: { error: 'Canvas no encontrado' } };

        let flowData = { nodes: [] as Array<Record<string, unknown>>, edges: [] as Array<Record<string, unknown>> };
        if (canvasRow.flow_data) {
          try { flowData = JSON.parse(canvasRow.flow_data); } catch { /* ignore */ }
        }

        // Generate node ID
        const nodeId = Math.random().toString(36).slice(2, 11);

        // Calculate position
        let posX = args.positionX as number | undefined;
        let posY = args.positionY as number | undefined;
        if (posX === undefined || posY === undefined) {
          const positions = flowData.nodes.map((n: Record<string, unknown>) => n.position as { x: number; y: number });
          const maxX = positions.length > 0 ? Math.max(...positions.map(p => p.x)) : 0;
          const avgY = positions.length > 0 ? positions.reduce((sum, p) => sum + p.y, 0) / positions.length : 200;
          posX = posX ?? maxX + 250;
          posY = posY ?? avgY;
        }

        const nodeData: Record<string, unknown> = { label: args.label };
        if (args.agentId) nodeData.agentId = args.agentId;
        if (args.connectorId) nodeData.connectorId = args.connectorId;
        if (args.instructions) nodeData.instructions = args.instructions;

        const newNode = {
          id: nodeId,
          type: (args.nodeType as string).toLowerCase(),
          position: { x: posX, y: posY },
          data: nodeData,
        };

        flowData.nodes.push(newNode);

        // PATCH
        // Use DB directly to avoid race with client auto-save
        const fdStr = JSON.stringify(flowData);
        db.prepare('UPDATE canvases SET flow_data = ?, node_count = ?, updated_at = ? WHERE id = ?')
          .run(fdStr, flowData.nodes.length, new Date().toISOString(), canvasId);

        // Verify the node was persisted
        const verifyRow = db.prepare('SELECT flow_data FROM canvases WHERE id = ?').get(canvasId) as { flow_data: string } | undefined;
        if (verifyRow) {
          const verifyFd = JSON.parse(verifyRow.flow_data);
          const found = verifyFd.nodes.some((n: Record<string, unknown>) => n.id === nodeId);
          if (!found) {
            return { name, result: { error: `Nodo ${nodeId} no se persistio correctamente` } };
          }
        }

        return {
          name,
          result: { nodeId, label: args.label, type: args.nodeType, position: { x: posX, y: posY } },
          actions: [{ type: 'navigate', url: `/canvas/${canvasId}`, label: 'Ver canvas →' }],
        };
      } catch (err) {
        return { name, result: { error: (err as Error).message } };
      }
    }

    case 'canvas_add_edge': {
      try {
        const canvasId = args.canvasId as string;
        const sourceNodeId = args.sourceNodeId as string;
        const targetNodeId = args.targetNodeId as string;

        const canvasRow = db.prepare('SELECT id, flow_data FROM canvases WHERE id = ?').get(canvasId) as { id: string; flow_data: string | null } | undefined;
        if (!canvasRow) return { name, result: { error: 'Canvas no encontrado' } };

        let flowData = { nodes: [] as Array<Record<string, unknown>>, edges: [] as Array<Record<string, unknown>> };
        if (canvasRow.flow_data) {
          try { flowData = JSON.parse(canvasRow.flow_data); } catch { /* ignore */ }
        }

        // Verify nodes exist
        const sourceExists = flowData.nodes.some((n: Record<string, unknown>) => n.id === sourceNodeId);
        const targetExists = flowData.nodes.some((n: Record<string, unknown>) => n.id === targetNodeId);
        if (!sourceExists) return { name, result: { error: `Nodo origen '${sourceNodeId}' no existe en el canvas` } };
        if (!targetExists) return { name, result: { error: `Nodo destino '${targetNodeId}' no existe en el canvas` } };

        const edgeId = `e-${sourceNodeId}-${targetNodeId}`;
        const newEdge: Record<string, unknown> = {
          id: edgeId,
          source: sourceNodeId,
          target: targetNodeId,
          type: 'default',
        };
        if (args.sourceHandle) newEdge.sourceHandle = args.sourceHandle;

        flowData.edges.push(newEdge);

        db.prepare('UPDATE canvases SET flow_data = ?, updated_at = ? WHERE id = ?')
          .run(JSON.stringify(flowData), new Date().toISOString(), canvasId);

        return {
          name,
          result: { edgeId, source: sourceNodeId, target: targetNodeId },
          actions: [{ type: 'navigate', url: `/canvas/${canvasId}`, label: 'Ver canvas →' }],
        };
      } catch (err) {
        return { name, result: { error: (err as Error).message } };
      }
    }

    case 'canvas_remove_node': {
      try {
        const canvasId = args.canvasId as string;
        const nodeId = args.nodeId as string;

        const canvasRow = db.prepare('SELECT id, flow_data FROM canvases WHERE id = ?').get(canvasId) as { id: string; flow_data: string | null } | undefined;
        if (!canvasRow) return { name, result: { error: 'Canvas no encontrado' } };

        let flowData = { nodes: [] as Array<Record<string, unknown>>, edges: [] as Array<Record<string, unknown>> };
        if (canvasRow.flow_data) {
          try { flowData = JSON.parse(canvasRow.flow_data); } catch { /* ignore */ }
        }

        const originalCount = flowData.nodes.length;
        flowData.nodes = flowData.nodes.filter((n: Record<string, unknown>) => n.id !== nodeId);
        if (flowData.nodes.length === originalCount) {
          return { name, result: { error: `Nodo '${nodeId}' no encontrado en el canvas` } };
        }

        flowData.edges = flowData.edges.filter((e: Record<string, unknown>) => e.source !== nodeId && e.target !== nodeId);

        db.prepare('UPDATE canvases SET flow_data = ?, node_count = ?, updated_at = ? WHERE id = ?')
          .run(JSON.stringify(flowData), flowData.nodes.length, new Date().toISOString(), canvasId);

        return {
          name,
          result: { removed: true, nodeId },
          actions: [{ type: 'navigate', url: `/canvas/${canvasId}`, label: 'Ver canvas →' }],
        };
      } catch (err) {
        return { name, result: { error: (err as Error).message } };
      }
    }

    case 'canvas_update_node': {
      try {
        const canvasId = args.canvasId as string;
        const nodeId = args.nodeId as string;

        const canvasRow = db.prepare('SELECT id, flow_data FROM canvases WHERE id = ?').get(canvasId) as { id: string; flow_data: string | null } | undefined;
        if (!canvasRow) return { name, result: { error: 'Canvas no encontrado' } };

        let flowData = { nodes: [] as Array<Record<string, unknown>>, edges: [] as Array<Record<string, unknown>> };
        if (canvasRow.flow_data) {
          try { flowData = JSON.parse(canvasRow.flow_data); } catch { /* ignore */ }
        }

        const node = flowData.nodes.find((n: Record<string, unknown>) => n.id === nodeId);
        if (!node) return { name, result: { error: `Nodo '${nodeId}' no encontrado en el canvas` } };

        const data = node.data as Record<string, unknown>;
        if (args.label) data.label = args.label;
        if (args.agentId) data.agentId = args.agentId;
        if (args.connectorId) data.connectorId = args.connectorId;
        if (args.instructions) data.instructions = args.instructions;
        if (args.skills) data.skills = args.skills;

        db.prepare('UPDATE canvases SET flow_data = ?, updated_at = ? WHERE id = ?')
          .run(JSON.stringify(flowData), new Date().toISOString(), canvasId);

        return {
          name,
          result: { updated: true, nodeId, newData: data },
          actions: [{ type: 'navigate', url: `/canvas/${canvasId}`, label: 'Ver canvas →' }],
        };
      } catch (err) {
        return { name, result: { error: (err as Error).message } };
      }
    }

    case 'canvas_execute': {
      try {
        const canvasId = args.canvasId as string;
        const res = await fetch(`${baseUrl}/api/canvas/${canvasId}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: args.input || '' }),
        });
        if (!res.ok) {
          const errText = await res.text();
          return { name, result: { error: `Error al ejecutar canvas: ${errText}` } };
        }
        const result = await res.json();
        return {
          name,
          result: { runId: result.runId, status: result.status, canvasId },
          actions: [{ type: 'navigate', url: `/canvas/${canvasId}`, label: 'Ver canvas →' }],
        };
      } catch (err) {
        return { name, result: { error: (err as Error).message } };
      }
    }

    // ─── Canvas Run Inspection Handlers ───

    case 'canvas_list_runs': {
      try {
        let canvasId = args.canvasId as string | undefined;
        const canvasName = args.canvasName as string | undefined;

        if (!canvasId && canvasName) {
          type CanvasRow = { id: string; name: string };
          let canvas: CanvasRow | undefined;
          canvas = db.prepare('SELECT id, name FROM canvases WHERE name = ?').get(canvasName) as CanvasRow | undefined;
          if (!canvas) {
            canvas = db.prepare('SELECT id, name FROM canvases WHERE name LIKE ?').get(`%${canvasName}%`) as CanvasRow | undefined;
          }
          if (!canvas) return { name, result: { error: `No se encontro canvas con nombre '${canvasName}'` } };
          canvasId = canvas.id;
        }

        if (!canvasId) return { name, result: { error: 'Se requiere canvasId o canvasName' } };

        const limit = (args.limit as number) || 10;
        const runs = db.prepare(
          `SELECT id, status, total_tokens, total_duration, started_at, completed_at, created_at
           FROM canvas_runs WHERE canvas_id = ? ORDER BY created_at DESC LIMIT ?`
        ).all(canvasId, limit) as Array<Record<string, unknown>>;

        return {
          name,
          result: { canvas_id: canvasId, total_runs: runs.length, runs },
          actions: [{ type: 'navigate', url: `/canvas/${canvasId}`, label: 'Ver canvas →' }],
        };
      } catch (err) {
        return { name, result: { error: (err as Error).message } };
      }
    }

    case 'canvas_get_run': {
      try {
        let canvasId = args.canvasId as string | undefined;
        const canvasName = args.canvasName as string | undefined;
        const runId = args.runId as string | undefined;

        if (!canvasId && canvasName) {
          type CanvasRow = { id: string; name: string };
          let canvas: CanvasRow | undefined;
          canvas = db.prepare('SELECT id, name FROM canvases WHERE name = ?').get(canvasName) as CanvasRow | undefined;
          if (!canvas) {
            canvas = db.prepare('SELECT id, name FROM canvases WHERE name LIKE ?').get(`%${canvasName}%`) as CanvasRow | undefined;
          }
          if (!canvas) return { name, result: { error: `No se encontro canvas con nombre '${canvasName}'` } };
          canvasId = canvas.id;
        }

        if (!canvasId) return { name, result: { error: 'Se requiere canvasId o canvasName' } };

        type RunRow = {
          id: string; canvas_id: string; status: string; node_states: string | null;
          current_node_id: string | null; execution_order: string | null;
          total_tokens: number; total_duration: number;
          started_at: string | null; completed_at: string | null; metadata: string | null;
        };

        let run: RunRow | undefined;
        if (runId) {
          run = db.prepare(
            `SELECT id, canvas_id, status, node_states, current_node_id, execution_order,
                    total_tokens, total_duration, started_at, completed_at, metadata
             FROM canvas_runs WHERE id = ? AND canvas_id = ?`
          ).get(runId, canvasId) as RunRow | undefined;
        } else {
          run = db.prepare(
            `SELECT id, canvas_id, status, node_states, current_node_id, execution_order,
                    total_tokens, total_duration, started_at, completed_at, metadata
             FROM canvas_runs WHERE canvas_id = ? ORDER BY created_at DESC LIMIT 1`
          ).get(canvasId) as RunRow | undefined;
        }

        if (!run) {
          return { name, result: { error: runId ? `Run '${runId}' no encontrado` : 'No hay runs para este canvas' } };
        }

        const nodeStates = run.node_states ? JSON.parse(run.node_states) : {};
        const executionOrder: string[] = run.execution_order ? JSON.parse(run.execution_order) : [];

        return {
          name,
          result: {
            run_id: run.id,
            canvas_id: run.canvas_id,
            status: run.status,
            current_node_id: run.current_node_id,
            execution_order: executionOrder,
            total_tokens: run.total_tokens,
            total_duration: run.total_duration,
            started_at: run.started_at,
            completed_at: run.completed_at,
            node_states: nodeStates,
          },
          actions: [{ type: 'navigate', url: `/canvas/${canvasId}`, label: 'Ver canvas →' }],
        };
      } catch (err) {
        return { name, result: { error: (err as Error).message } };
      }
    }

    default:
      return { name, result: { error: `Tool ${name} no encontrado` } };
  }
}
