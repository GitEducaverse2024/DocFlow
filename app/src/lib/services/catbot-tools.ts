import db from '@/lib/db';
import { getHoldedTools, isHoldedTool } from './catbot-holded-tools';
import { renderTemplate } from './template-renderer';
import { resolveAssetsForEmail } from './template-asset-resolver';
import { resolveAlias, getAllAliases, updateAlias } from '@/lib/services/alias-routing';
import { getInventory } from '@/lib/services/discovery';
import { getAll as getMidModels, midToMarkdown } from '@/lib/services/mid';
import type { TemplateStructure, EmailTemplate } from '@/lib/types';

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
          model: { type: 'string', description: 'Modelo LLM a usar (default: configured via alias routing)' },
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
          type: { type: 'string', enum: ['n8n_webhook', 'http_api', 'mcp_server', 'email', 'email_template'], description: 'Tipo de conector' },
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
          url: { type: 'string', description: 'URL relativa (ej: /catbrains, /agents, /catpower, /catpower/skills, /catpower/connectors, /catpower/templates, /catflow, /tasks/new)' },
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
      description: 'Envia un email usando un conector Gmail configurado. Soporta texto plano y/o HTML (para plantillas renderizadas). IMPORTANTE: Siempre confirma con el usuario antes de ejecutar.',
      parameters: {
        type: 'object',
        properties: {
          connector_name: { type: 'string', description: 'Nombre del conector Gmail a usar' },
          to: { type: 'string', description: 'Email destinatario' },
          subject: { type: 'string', description: 'Asunto del email' },
          body: { type: 'string', description: 'Cuerpo del email (texto plano). Se usa como fallback si html_body esta presente.' },
          html_body: { type: 'string', description: 'Cuerpo HTML del email. Usar con el resultado de render_email_template. Si se proporciona, el email se envia como HTML.' },
          cc: { type: 'string', description: 'Email en copia (CC), opcional' },
        },
        required: ['connector_name', 'to', 'subject'],
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
  // ─── Email Template Tools ───
  {
    type: 'function',
    function: {
      name: 'list_email_templates',
      description: 'Lista las plantillas de email disponibles. Puede filtrar por categoria.',
      parameters: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: ['general', 'corporate', 'commercial', 'report', 'notification'], description: 'Filtrar por categoria (opcional)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_email_template',
      description: 'Obtiene el detalle completo de una plantilla de email: estructura, bloques, variables de instruccion y assets. Acepta ID, nombre o RefCode (codigo de 6 caracteres).',
      parameters: {
        type: 'object',
        properties: {
          templateId: { type: 'string', description: 'ID de la plantilla' },
          templateName: { type: 'string', description: 'Nombre de la plantilla (busca por nombre si no se pasa templateId)' },
          refCode: { type: 'string', description: 'RefCode de 6 caracteres de la plantilla (alternativa a templateId/templateName)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_email_template',
      description: 'Crea una nueva plantilla de email. Opcionalmente puedes pasar la estructura completa con secciones y bloques.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nombre de la plantilla' },
          description: { type: 'string', description: 'Descripcion de la plantilla' },
          category: { type: 'string', enum: ['general', 'corporate', 'commercial', 'report', 'notification'], description: 'Categoria (default: general)' },
          structure: {
            type: 'object',
            description: 'Estructura completa del template con sections (header/body/footer) y styles. Cada section tiene rows, cada row tiene columns con block {type, content/src/url/text, align, width, alt}. Tipos de bloque: logo, image, video, text, instruction.',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_email_template',
      description: 'Actualiza una plantilla de email existente: nombre, descripcion, categoria, estructura o estado activo/inactivo.',
      parameters: {
        type: 'object',
        properties: {
          templateId: { type: 'string', description: 'ID de la plantilla a actualizar' },
          name: { type: 'string', description: 'Nuevo nombre' },
          description: { type: 'string', description: 'Nueva descripcion' },
          category: { type: 'string', enum: ['general', 'corporate', 'commercial', 'report', 'notification'], description: 'Nueva categoria' },
          is_active: { type: 'boolean', description: 'Activar (true) o desactivar (false) la plantilla' },
          structure: { type: 'object', description: 'Nueva estructura completa del template' },
        },
        required: ['templateId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_email_template',
      description: 'Elimina una plantilla de email. IMPORTANTE: Confirma con el usuario antes de eliminar.',
      parameters: {
        type: 'object',
        properties: {
          templateId: { type: 'string', description: 'ID de la plantilla a eliminar' },
        },
        required: ['templateId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'render_email_template',
      description: 'Renderiza una plantilla con variables rellenadas y devuelve HTML + texto plano listo para enviar. Acepta templateId o refCode. Las claves de variables deben coincidir EXACTAMENTE con el campo "text" de cada bloque instruction.',
      parameters: {
        type: 'object',
        properties: {
          templateId: { type: 'string', description: 'ID de la plantilla (o RefCode de 6 caracteres)' },
          refCode: { type: 'string', description: 'RefCode de 6 caracteres (alternativa a templateId)' },
          variables: { type: 'object', description: 'Mapa de {clave_instruccion: contenido}. Las claves deben coincidir con el campo text de los bloques instruction.' },
        },
        required: ['variables'],
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
      description: 'Anade un nodo nuevo a un canvas existente. Si se pasa insert_between, inserta el nodo ENTRE dos nodos existentes: calcula posicion media, elimina el edge viejo y crea los 2 edges nuevos automaticamente. Para ITERATOR: usa canvas_generate_iterator_end para crear el par automaticamente.',
      parameters: {
        type: 'object',
        properties: {
          canvasId: { type: 'string', description: 'ID del canvas' },
          nodeType: { type: 'string', enum: ['AGENT', 'PROJECT', 'CONNECTOR', 'CHECKPOINT', 'MERGE', 'CONDITION', 'ITERATOR', 'OUTPUT'], description: 'Tipo de nodo' },
          label: { type: 'string', description: 'Nombre visible del nodo' },
          agentId: { type: 'string', description: 'ID del agente (para nodos AGENT)' },
          connectorId: { type: 'string', description: 'ID del conector (para nodos CONNECTOR)' },
          instructions: { type: 'string', description: 'Instrucciones del nodo' },
          positionX: { type: 'number', description: 'Posicion X en el canvas' },
          positionY: { type: 'number', description: 'Posicion Y en el canvas' },
          separator: { type: 'string', description: 'Para ITERATOR: separador para parsear el input (vacio=autodetect JSON/lineas)' },
          limit_mode: { type: 'string', enum: ['none', 'rounds', 'time'], description: 'Para ITERATOR: modo de limite (none/rounds/time)' },
          max_rounds: { type: 'number', description: 'Para ITERATOR con limit_mode=rounds: max iteraciones' },
          max_time: { type: 'number', description: 'Para ITERATOR con limit_mode=time: max segundos' },
          insert_between: { type: 'object', description: 'Insertar entre 2 nodos: { sourceNodeId, targetNodeId }. Calcula posicion media, elimina edge viejo, crea 2 edges nuevos.', properties: { sourceNodeId: { type: 'string' }, targetNodeId: { type: 'string' } }, required: ['sourceNodeId', 'targetNodeId'] },
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
          sourceHandle: { type: 'string', description: 'Handle de salida (CONDITION: yes/no, ITERATOR: element/completed, SCHEDULER: output-true/output-completed)' },
        },
        required: ['canvasId', 'sourceNodeId', 'targetNodeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_delete_edge',
      description: 'Elimina una conexion (edge) entre dos nodos del canvas. El edgeId se obtiene del array "edges" de canvas_get.',
      parameters: {
        type: 'object',
        properties: {
          canvasId: { type: 'string', description: 'ID del canvas' },
          edgeId: { type: 'string', description: 'ID del edge a eliminar (formato: e-{sourceId}-{targetId})' },
        },
        required: ['canvasId', 'edgeId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'canvas_generate_iterator_end',
      description: 'Genera un nodo Iterator End emparejado con un Iterator existente. Lo posiciona 500px a la derecha y crea la vinculacion bidireccional. Necesario para activar el bucle del Iterator.',
      parameters: {
        type: 'object',
        properties: {
          canvasId: { type: 'string', description: 'ID del canvas' },
          iteratorNodeId: { type: 'string', description: 'ID del nodo Iterator al que emparejar' },
        },
        required: ['canvasId', 'iteratorNodeId'],
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
      description: 'Actualiza la configuracion de un nodo existente (instrucciones, agente, conector, label, skills, y parametros de Iterator)',
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
          separator: { type: 'string', description: 'Para ITERATOR: separador (vacio=autodetect)' },
          limit_mode: { type: 'string', enum: ['none', 'rounds', 'time'], description: 'Para ITERATOR: modo de limite' },
          max_rounds: { type: 'number', description: 'Para ITERATOR: max iteraciones' },
          max_time: { type: 'number', description: 'Para ITERATOR: max segundos' },
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
  {
    type: 'function',
    function: {
      name: 'get_model_landscape',
      description: 'Obtiene el inventario completo de modelos disponibles con tiers, capacidades y usos recomendados. Usa esta tool cuando el usuario pregunte que modelos tiene o quiera ver el paisaje de modelos.',
      parameters: {
        type: 'object',
        properties: {
          detail: { type: 'string', enum: ['compact', 'full'], description: 'Nivel de detalle (default: compact)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recommend_model_for_task',
      description: 'Recomienda el modelo optimo para una tarea basandose en MID. Analiza tipo de tarea, complejidad y presupuesto para sugerir el mejor modelo.',
      parameters: {
        type: 'object',
        properties: {
          task_description: { type: 'string', description: 'Descripcion de la tarea o tipo de trabajo' },
          complexity: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Complejidad estimada de la tarea' },
          prefer_local: { type: 'boolean', description: 'Preferir modelos locales (Ollama) sobre API' },
        },
        required: ['task_description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_alias_routing',
      description: 'Cambia el modelo asignado a un alias de routing. IMPORTANTE: Siempre confirma con el usuario antes de ejecutar este cambio.',
      parameters: {
        type: 'object',
        properties: {
          alias: { type: 'string', description: 'Nombre del alias (ej: chat-rag, catbot, process-docs, agent-task, generate-content, embed, canvas-agent, canvas-format)' },
          new_model: { type: 'string', description: 'Model key del nuevo modelo (debe estar disponible en Discovery)' },
        },
        required: ['alias', 'new_model'],
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
  'conectores': 'Los **Conectores** permiten integrar DoCatFlow con servicios externos: n8n webhooks, APIs HTTP, servidores MCP, Gmail, Google Drive, email templates. Se configuran en /catpower/connectors.',
  'gmail': '**Conectores Gmail** soportan dos modos de autenticacion:\n' +
    '**App Password (IMAP/SMTP):** Para cuentas Workspace con relay SMTP. Soporta: list, search, read, get_thread (X-GM-THRID), send, reply, mark_as_read. Busqueda con operadores: is:unread, from:, subject:, after:YYYY/MM/DD, before:YYYY/MM/DD (combinables). NO soporta: drafts, filtros avanzados Gmail (in:sent, has:attachment, label:).\n' +
    '**OAuth2:** Para cuentas personales o Workspace. Soporta TODO lo de App Password + drafts + filtros avanzados Gmail (in:sent, in:trash, has:attachment, label:, threadId via API) + busqueda en cualquier carpeta.\n\n' +
    '**Herramientas Gmail disponibles (9):**\n' +
    '- `list_email_connectors` — lista conectores Gmail activos con auth_mode y capabilities\n' +
    '- `send_email` — envia email con texto plano o HTML (para plantillas). Params: connector_name, to, subject, body, html_body, cc\n' +
    '- En CatPaws con conector Gmail vinculado (9 tools por conector):\n' +
    '  - `gmail_list_emails` — listar emails (INBOX o sent). Devuelve id, threadId, subject, from, date, isRead\n' +
    '  - `gmail_search_emails` — buscar con operadores. OAuth2: todos los operadores Gmail. IMAP: is:unread, from:, subject:, after:, before:\n' +
    '  - `gmail_read_email` — leer UN mensaje por ID (no el hilo)\n' +
    '  - `gmail_get_thread` — obtener TODOS los mensajes de un hilo. Param checkReplyFrom detecta si una cuenta ya respondio\n' +
    '  - `gmail_draft_email` — crear borrador (solo OAuth2)\n' +
    '  - `gmail_send_email` — enviar con HTML y CC\n' +
    '  - `gmail_mark_as_read` — marcar como leido\n' +
    '  - `gmail_reply_to_message` — responder en el mismo hilo\n\n' +
    '**Reglas para Canvas Inbound:**\n' +
    '1. Buscar por fecha (after:) en vez de solo is:unread — emails leidos por directivos desde movil tambien necesitan atencion\n' +
    '2. Para cada email, usar get_thread con checkReplyFrom para saber si ya se respondio\n' +
    '3. Tras responder, mark_as_read para evitar reprocesamiento\n' +
    '4. Filtrar por 7 dias maximo para no traer historico\n' +
    '5. Agrupar por threadId para no procesar duplicados del mismo hilo',
  'rag': 'El **RAG** (Retrieval-Augmented Generation) indexa documentos procesados en vectores (Qdrant + Ollama embeddings) para que puedas hacer preguntas en lenguaje natural sobre el contenido.',
  'workers': 'Los **Docs Workers** han sido migrados a CatPaws con modo procesador. Visita /agents?mode=processor para ver los procesadores.',
  'catpaws': 'Los **Agentes** (CatPaws) son entidades unificadas con 3 modos: chat (conversacionales), processor (procesadores de documentos), e hybrid (ambos). Se crean en /agents y se pueden vincular a CatBrains, conectores y skills.',
  'skills': 'Las **Skills** son paquetes de instrucciones reutilizables que se inyectan en el system prompt de los agentes (CatPaws). Se gestionan en /catpower/skills.\n' +
    '**Acciones:** Crear, Importar JSON, Descargar Plantilla, Exportar, Duplicar.\n' +
    '**Formato JSON para importar/exportar:**\n' +
    '```json\n{\n  "name": "Nombre (OBLIGATORIO)",\n  "instructions": "Instrucciones completas (OBLIGATORIO)",\n  "description": "Descripcion corta",\n  "category": "writing|analysis|strategy|technical|format|sales|system",\n  "tags": ["tag1","tag2"],\n  "output_template": null,\n  "example_input": "Ejemplo input",\n  "example_output": "Ejemplo output",\n  "constraints": "Restricciones",\n  "author": "Autor",\n  "version": "1.0"\n}\n```\n' +
    '- Acepta un objeto o array de objetos para importar multiples skills\n' +
    '- Solo `name` e `instructions` son obligatorios\n' +
    '- Las instructions se inyectan como system prompt. Soportan Markdown y pueden referenciar tools del agente.\n' +
    '- Categorias: writing (redaccion), analysis (investigacion), strategy (estrategia), technical (tecnico), format (formato), sales (ventas), system (interno)\n' +
    '**Como crear una skill profesional:**\n' +
    '1. Define ROL: que experto es el agente\n' +
    '2. Define PROTOCOLO: pasos numerados a seguir siempre\n' +
    '3. Define REGLAS: que debe y NO debe hacer\n' +
    '4. Define FORMATO de salida: JSON, markdown, HTML, texto\n' +
    '5. Incluye EJEMPLOS si el formato es complejo\n' +
    'Puedo generar el JSON de una skill si me describes que necesitas.',
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
  'catflow': 'Los **CatFlows** son pipelines visuales multi-agente en /catflow. ' +
    'Nodos disponibles: Start, Agent, CatBrain, Connector, Checkpoint, Merge, Condition, Scheduler, Iterator, Iterator End, Storage, MultiAgent, Output.\n' +
    '**Modelo de dos capas en nodos Agent:**\n' +
    '- **Base** (CatPaw): skills, conectores y CatBrains del agente en /agents. Pills con borde solido, NO se pueden quitar desde canvas.\n' +
    '- **Extras** (Canvas): skills, conectores y CatBrains añadidos con "+ Vincular" solo para este nodo. Borde dashed, con X. NO modifican el CatPaw base.\n' +
    '- CatBrains vinculados (base + extras) inyectan contexto RAG automaticamente al ejecutar.\n' +
    '- En ejecucion se MERGEAN base + extras (sin duplicados).\n' +
    '- Esto permite reutilizar un CatPaw en multiples canvas con skills/conectores diferentes sin tocar la configuracion base.\n' +
    '- Para añadir una skill extra a un nodo, usar canvas_update_node con skills: ["id1", "id2"] (solo extras, las base se cargan automaticamente).\n' +
    'Los CatFlows pueden escuchar senales de otros CatFlows (modo escucha) y activarse automaticamente.',
  'iterator': '**Iterator** es un nodo de canvas que permite hacer bucles forEach sobre arrays.\n\n' +
    '**Como funciona:**\n' +
    '1. El nodo Iterator recibe una lista (JSON array, lineas, o separador custom) del nodo anterior\n' +
    '2. Emite un elemento a la vez por el handle "element" hacia los nodos del loop body\n' +
    '3. El nodo Iterator End señaliza el fin de cada iteracion\n' +
    '4. Cuando completa todas las iteraciones, Iterator End emite el array de resultados acumulados\n\n' +
    '**Pareja ITERATOR ↔ ITERATOR_END:**\n' +
    '- El Iterator End se genera con el boton "Generar interruptor" en la config del Iterator\n' +
    '- Si se elimina el Iterator End, el Iterator ejecuta una sola vez (sin bucle)\n' +
    '- Si el array esta vacio, el Iterator salta al handle "completed" sin entrar al loop\n\n' +
    '**Limites configurables:**\n' +
    '- Sin limite (procesa todos los elementos)\n' +
    '- Maximo de iteraciones (ej: max 10)\n' +
    '- Tiempo maximo (ej: 300 segundos)\n\n' +
    '**Resiliencia:** Si un nodo del loop falla, el error se captura como resultado parcial y el bucle continua con el siguiente elemento.\n\n' +
    '**Ejemplo de uso:**\n' +
    '```\nStart → Agent (Lista emails) → Iterator\n' +
    '                                  ├─ element → Agent (Procesar) → Iterator End → Output\n' +
    '                                  └─ completed → Output ("Sin emails")\n```\n\n' +
    '**Para crear un Iterator via CatBot:** usa canvas_add_node con nodeType=ITERATOR. Luego canvas_generate_iterator_end para crear el par. Conecta handle "element" al loop body, ultimo nodo del loop al Iterator End. Salida del Iterator End al nodo post-loop.',
  'reglas_canvas': '**Reglas de Oro para disenar CatFlows** (derivadas de fallos reales):\n\n' +
    '**ANTES de disenar:**\n' +
    '- R01: Definir contrato de datos entre TODOS los nodos (campos que produce/consume cada uno) ANTES de escribir instrucciones\n' +
    '- R02: Calcular N_items x tool_calls_por_item vs MAX_TOOL_ROUNDS (12). Si >60%, usar ITERATOR\n' +
    '- R03: Traducir problema de negocio a criterios tecnicos verificables\n' +
    '- R04: Probar flujo minimo (START → 1 nodo LLM → Output) con datos reales antes de anadir nodos\n\n' +
    '**Diseno de nodos:**\n' +
    '- R05: Un nodo = una responsabilidad. Si redacta+maqueta+selecciona, dividir\n' +
    '- R06: Conocimiento de negocio en SKILLS, no en instrucciones del nodo\n' +
    '- R07: CatBrain = texto→texto. Agent+CatBrain = JSON→JSON con RAG. Para arrays JSON SIEMPRE Agent\n' +
    '- R08: No vincular conectores/skills innecesarios — cada tool es contexto que confunde al LLM\n' +
    '- R09: CatPaws genericos, especializacion via extras del nodo canvas\n\n' +
    '**Instrucciones LLM:**\n' +
    '- R10: JSON in → JSON out: primera linea = regla anti-telefono-escacharrado (mantener TODOS los campos originales)\n' +
    '- R11: Instrucciones dicen QUE hacer, no prohiben. Si escribes "NO hagas X" 5 veces, cambia el diseno\n' +
    '- R12: Siempre especificar "PASA SIN MODIFICAR" para items que el nodo debe ignorar\n' +
    '- R13: Nombres de campos canonicos identicos en todo el pipeline\n\n' +
    '**Ejecucion:**\n' +
    '- R14: Arrays + tools = ITERATOR. Nunca arrays >1 item a nodos con tool-calling interno\n' +
    '- R15: Nodo LLM recibe la cantidad MINIMA de info necesaria\n' +
    '- R16: Max Tokens = N_items x M_campos x 60 tokens\n' +
    '- R17: Todo nodo LLM es probabilistico. Planificar contratos, ITERATOR, fallbacks\n\n' +
    '**Plantillas:**\n' +
    '- R18: Toda plantilla con contenido dinamico necesita al menos 1 bloque instruction. Sin el, el connector inyecta HTML despues del visual\n' +
    '- R19: Separar seleccion de plantilla (skill) de maquetacion (tools)\n\n' +
    '**Separacion LLM / Codigo:**\n' +
    '- R20: Si puede hacerse con codigo (render, send, mark_read, buscar DB), NO delegarlo al LLM. El LLM produce el ESQUEMA. El codigo ejecuta\n' +
    '- R21: El codigo SIEMPRE limpia output del LLM (strip markdown, validar JSON). Nunca confiar en el formato\n' +
    '- R22: Referencias entre entidades usan RefCodes (6 chars), no nombres. Lookup tolerante: ref_code → nombre → parcial → ID\n' +
    '- R23: Separar nodos de pensamiento (LLM) de nodos de ejecucion (codigo). No mezclar en el mismo nodo\n\n' +
    '**Resiliencia:**\n' +
    '- R24: Nunca hacer fallback destructivo. Si input corrupto, devolver vacio — no inventar datos\n' +
    '- R25: Idempotencia obligatoria: registrar messageId procesados. Triple proteccion: Lector + ITERATOR + Connector',
  'templates': 'Las **Plantillas de Email** (CatPower > Templates) permiten disenar emails corporativos con un editor visual drag-and-drop. ' +
    '5 tipos de bloque: Logo, Imagen, Video (YouTube), Texto (markdown), Instruccion IA (variable que el agente rellena al enviar). ' +
    'Estructura: 3 secciones (header, body, footer), cada una con filas de 1-2 columnas. ' +
    'Las imagenes se suben a Drive automaticamente con URL publica. Preview HTML en tiempo real. ' +
    'Los agentes (CatPaws) con el conector email_template y la skill "Maquetador de Email" pueden seleccionar, rellenar y renderizar plantillas automaticamente. ' +
    'Puedo crear, editar, eliminar y renderizar plantillas directamente. Usa `/catpower/templates` para el editor visual.',
  'catpower': '**CatPower** es el modulo paraguas que agrupa Skills, Conectores y Templates en /catpower. ' +
    'Skills: instrucciones reutilizables para agentes. Conectores: integraciones externas. Templates: plantillas de email con editor visual.',
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
    if (name.startsWith('holded_') || isHoldedTool(name)) return true;
    if (name === 'navigate_to' || name === 'explain_feature' || name.startsWith('list_') || name.startsWith('get_')
      || name === 'execute_catflow' || name === 'toggle_catflow_listen' || name === 'fork_catflow'
      || name === 'canvas_list' || name === 'canvas_get' || name === 'canvas_list_runs' || name === 'canvas_get_run'
      || name === 'recommend_model_for_task') return true;
    if (name === 'update_alias_routing' && (allowedActions.includes('manage_models') || !allowedActions.length)) return true;
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
    // Email template tools: list/get/render always allowed; create/update/delete need permission or empty allowedActions
    if (['list_email_templates', 'get_email_template', 'render_email_template'].includes(name)) return true;
    if (['create_email_template', 'update_email_template', 'delete_email_template'].includes(name) && (allowedActions.includes('manage_templates') || !allowedActions.length)) return true;
    return false;
  });
}

// Helper: suggest optimal model tier for a canvas node based on heuristics
function suggestModelForNode(
  node: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  midModels: Array<{ model_key: string; tier?: string; status?: string }>
): { current_model?: string; suggested_tier: string; reason: string } | null {
  try {
    const nodeType = (node.type as string || '').toLowerCase();
    const data = (node.data || {}) as Record<string, unknown>;

    // OUTPUT nodes: always suggest Libre
    if (nodeType === 'output') {
      return { suggested_tier: 'Libre', reason: 'Formateo no requiere modelo costoso' };
    }

    // Only process agent nodes
    if (nodeType !== 'agent') return null;

    const currentModel = (data.model as string) || undefined;
    const instructions = ((data.instructions as string) || '').toLowerCase();

    // Heuristic keywords for task complexity
    const simpleKeywords = ['clasificar', 'filtrar', 'formato', 'extraer', 'listar', 'copiar', 'mover'];
    const complexKeywords = ['analizar', 'razonar', 'crear', 'redactar', 'evaluar', 'disenar', 'estrategia', 'investigar'];

    const hasSimple = simpleKeywords.some(k => instructions.includes(k));
    const hasComplex = complexKeywords.some(k => instructions.includes(k));

    let suggestedTier: string;
    let reason: string;

    if (hasComplex && !hasSimple) {
      suggestedTier = 'Pro/Elite';
      reason = 'Tarea de razonamiento/analisis detectada en instrucciones';
    } else if (hasSimple && !hasComplex) {
      suggestedTier = 'Libre/Pro';
      reason = 'Tarea de procesamiento/clasificacion detectada en instrucciones';
    } else if (hasComplex && hasSimple) {
      suggestedTier = 'Pro';
      reason = 'Tarea mixta — Pro ofrece buen balance';
    } else {
      suggestedTier = 'Pro';
      reason = 'Tier por defecto — sin keywords especificos en instrucciones';
    }

    return { current_model: currentModel, suggested_tier: suggestedTier, reason };
  } catch {
    return null;
  }
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
      const resolvedModel = (args.model as string) || await resolveAlias('agent-task');
      db.prepare(
        `INSERT INTO cat_paws (id, name, avatar_emoji, mode, model, department, description, system_prompt, temperature, max_tokens, output_format, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      ).run(id, args.name, '🐾', mode, resolvedModel, department, args.description || '', args.system_prompt || null, temperature, maxTokens, outputFormat, now, now);
      return {
        name,
        result: { id, name: args.name, mode, department, model: resolvedModel, temperature, output_format: outputFormat, max_tokens: maxTokens, has_system_prompt: !!args.system_prompt },
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
          'SELECT id, name, type, gmail_subtype, config, is_active, test_status FROM connectors WHERE type = \'gmail\' AND is_active = 1'
        ).all() as Array<{ id: string; name: string; gmail_subtype: string | null; config: string | null; test_status: string | null }>;
        if (connectors.length === 0) {
          return { name, result: { message: 'No hay conectores Gmail activos configurados.' } };
        }
        return {
          name,
          result: connectors.map(c => {
            const cfg = c.config ? JSON.parse(c.config) : {};
            return {
              id: c.id,
              name: c.name,
              user: cfg.user,
              auth_mode: cfg.auth_mode || 'app_password',
              gmail_subtype: c.gmail_subtype,
              test_status: c.test_status,
              capabilities: cfg.auth_mode === 'oauth2'
                ? ['list', 'search', 'read', 'get_thread', 'send', 'reply', 'mark_as_read', 'draft', 'advanced_filters']
                : ['list', 'search', 'read', 'get_thread', 'send', 'reply', 'mark_as_read', 'date_filter'],
            };
          }),
          actions: [{ type: 'navigate', url: '/catpower/connectors', label: 'Ver conectores →' }],
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
        const body = args.body as string | undefined;
        const htmlBody = args.html_body as string | undefined;
        const cc = args.cc as string | undefined;

        if (!body && !htmlBody) {
          return { name, result: { sent: false, error: 'Se requiere body o html_body' } };
        }

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

        // Build email payload — include html_body for template-rendered emails
        const emailPayload: Record<string, string> = { to, subject };
        if (htmlBody) emailPayload.html_body = htmlBody;
        if (body) emailPayload.text_body = body;
        if (cc) emailPayload.cc = cc;

        const invokeRes = await fetch(`${baseUrl}/api/connectors/${connector.id}/invoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ output: JSON.stringify(emailPayload) }),
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

        // Enrich nodes with model suggestions (CATBOT-05)
        let midModels: Array<{ model_key: string; tier?: string; status?: string }> = [];
        try {
          midModels = getMidModels({ status: 'active' });
        } catch { /* graceful degradation */ }

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
              model_suggestion: suggestModelForNode(n, midModels),
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
        const insertBetween = args.insert_between as { sourceNodeId: string; targetNodeId: string } | undefined;

        const canvasRow = db.prepare('SELECT id, flow_data FROM canvases WHERE id = ?').get(canvasId) as { id: string; flow_data: string | null } | undefined;
        if (!canvasRow) return { name, result: { error: 'Canvas no encontrado' } };

        let flowData = { nodes: [] as Array<Record<string, unknown>>, edges: [] as Array<Record<string, unknown>> };
        if (canvasRow.flow_data) {
          try { flowData = JSON.parse(canvasRow.flow_data); } catch { /* ignore */ }
        }

        const nodeId = Math.random().toString(36).slice(2, 11);

        // Calculate position
        let posX = args.positionX as number | undefined;
        let posY = args.positionY as number | undefined;

        if (insertBetween) {
          // Insert between: calculate midpoint from source and target positions
          const sourceNode = flowData.nodes.find((n: Record<string, unknown>) => n.id === insertBetween.sourceNodeId);
          const targetNode = flowData.nodes.find((n: Record<string, unknown>) => n.id === insertBetween.targetNodeId);
          if (!sourceNode) return { name, result: { error: `Nodo origen '${insertBetween.sourceNodeId}' no existe` } };
          if (!targetNode) return { name, result: { error: `Nodo destino '${insertBetween.targetNodeId}' no existe` } };

          const srcPos = sourceNode.position as { x: number; y: number };
          const tgtPos = targetNode.position as { x: number; y: number };
          posX = posX ?? Math.round((srcPos.x + tgtPos.x) / 2);
          posY = posY ?? Math.round((srcPos.y + tgtPos.y) / 2);
        } else if (posX === undefined || posY === undefined) {
          const positions = flowData.nodes.map((n: Record<string, unknown>) => n.position as { x: number; y: number });
          const maxX = positions.length > 0 ? Math.max(...positions.map(p => p.x)) : 0;
          const avgY = positions.length > 0 ? positions.reduce((sum, p) => sum + p.y, 0) / positions.length : 200;
          posX = posX ?? maxX + 250;
          posY = posY ?? avgY;
        }

        const nodeData: Record<string, unknown> = { label: args.label };
        if (args.agentId) {
          nodeData.agentId = args.agentId;
          // Auto-resolve agentName from DB — never use UUID as display name
          const paw = db.prepare('SELECT name, model, mode FROM cat_paws WHERE id = ?').get(args.agentId as string) as { name: string; model?: string; mode?: string } | undefined;
          nodeData.agentName = paw?.name || (args.label as string);
          if (paw?.model) nodeData.model = paw.model;
          if (paw?.mode) nodeData.mode = paw.mode;
        }
        if (args.connectorId) {
          nodeData.connectorId = args.connectorId;
          const conn = db.prepare('SELECT name, emoji FROM connectors WHERE id = ?').get(args.connectorId as string) as { name: string; emoji?: string } | undefined;
          if (conn) nodeData.connectorName = conn.name;
        }
        if (args.instructions) nodeData.instructions = args.instructions;

        // Iterator-specific config
        const nodeTypeLower = (args.nodeType as string).toLowerCase();
        if (nodeTypeLower === 'iterator') {
          nodeData.limit_mode = (args.limit_mode as string) || 'none';
          nodeData.max_rounds = (args.max_rounds as number) || 10;
          nodeData.max_time = (args.max_time as number) || 300;
          nodeData.separator = (args.separator as string) || '';
          nodeData.iteratorEndId = null;
        }

        const newNode = {
          id: nodeId,
          type: nodeTypeLower,
          position: { x: posX, y: posY },
          data: nodeData,
        };

        flowData.nodes.push(newNode);

        // If insert_between: remove old edge and create 2 new ones
        let edgesCreated: string[] = [];
        if (insertBetween) {
          // Remove edge between source and target
          flowData.edges = flowData.edges.filter((e: Record<string, unknown>) =>
            !(e.source === insertBetween.sourceNodeId && e.target === insertBetween.targetNodeId)
          );
          // Create source → new node edge
          const edgeA = `e-${insertBetween.sourceNodeId}-${nodeId}`;
          flowData.edges.push({ id: edgeA, source: insertBetween.sourceNodeId, target: nodeId, type: 'default' });
          // Create new node → target edge
          const edgeB = `e-${nodeId}-${insertBetween.targetNodeId}`;
          flowData.edges.push({ id: edgeB, source: nodeId, target: insertBetween.targetNodeId, type: 'default' });
          edgesCreated = [edgeA, edgeB];
        }

        db.prepare('UPDATE canvases SET flow_data = ?, node_count = ?, updated_at = ? WHERE id = ?')
          .run(JSON.stringify(flowData), flowData.nodes.length, new Date().toISOString(), canvasId);

        // Verify persistence
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
          result: {
            nodeId, label: args.label, type: args.nodeType, position: { x: posX, y: posY },
            ...(edgesCreated.length > 0 ? { inserted_between: insertBetween, edges_created: edgesCreated } : {}),
          },
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

    case 'canvas_delete_edge': {
      try {
        const canvasId = args.canvasId as string;
        const edgeId = args.edgeId as string;

        const canvasRow = db.prepare('SELECT id, flow_data FROM canvases WHERE id = ?').get(canvasId) as { id: string; flow_data: string | null } | undefined;
        if (!canvasRow) return { name, result: { error: 'Canvas no encontrado' } };

        let flowData = { nodes: [] as Array<Record<string, unknown>>, edges: [] as Array<Record<string, unknown>> };
        if (canvasRow.flow_data) {
          try { flowData = JSON.parse(canvasRow.flow_data); } catch { /* ignore */ }
        }

        const originalCount = flowData.edges.length;
        flowData.edges = flowData.edges.filter((e: Record<string, unknown>) => e.id !== edgeId);
        if (flowData.edges.length === originalCount) {
          return { name, result: { error: `Edge '${edgeId}' no encontrado en el canvas` } };
        }

        db.prepare('UPDATE canvases SET flow_data = ?, updated_at = ? WHERE id = ?')
          .run(JSON.stringify(flowData), new Date().toISOString(), canvasId);

        return {
          name,
          result: { deleted: true, edgeId, edges_remaining: flowData.edges.length },
          actions: [{ type: 'navigate', url: `/canvas/${canvasId}`, label: 'Ver canvas →' }],
        };
      } catch (err) {
        return { name, result: { error: (err as Error).message } };
      }
    }

    case 'canvas_generate_iterator_end': {
      try {
        const canvasId = args.canvasId as string;
        const iteratorNodeId = args.iteratorNodeId as string;

        const canvasRow = db.prepare('SELECT id, flow_data FROM canvases WHERE id = ?').get(canvasId) as { id: string; flow_data: string | null } | undefined;
        if (!canvasRow) return { name, result: { error: 'Canvas no encontrado' } };

        let flowData = { nodes: [] as Array<Record<string, unknown>>, edges: [] as Array<Record<string, unknown>> };
        if (canvasRow.flow_data) {
          try { flowData = JSON.parse(canvasRow.flow_data); } catch { /* ignore */ }
        }

        const iteratorNode = flowData.nodes.find((n: Record<string, unknown>) => n.id === iteratorNodeId);
        if (!iteratorNode) return { name, result: { error: `Nodo Iterator '${iteratorNodeId}' no encontrado` } };
        if ((iteratorNode.type as string) !== 'iterator') return { name, result: { error: `El nodo '${iteratorNodeId}' no es de tipo iterator` } };

        const iterData = iteratorNode.data as Record<string, unknown>;
        if (iterData.iteratorEndId) return { name, result: { error: `El Iterator ya tiene un Iterator End vinculado: ${iterData.iteratorEndId}` } };

        // Create Iterator End node positioned 500px to the right
        const endNodeId = Math.random().toString(36).slice(2, 11);
        const iterPos = iteratorNode.position as { x: number; y: number };
        const endNode = {
          id: endNodeId,
          type: 'iterator_end',
          position: { x: iterPos.x + 500, y: iterPos.y },
          data: { label: 'Iterator End', iteratorId: iteratorNodeId },
        };

        // Link the pair
        iterData.iteratorEndId = endNodeId;
        flowData.nodes.push(endNode);

        db.prepare('UPDATE canvases SET flow_data = ?, node_count = ?, updated_at = ? WHERE id = ?')
          .run(JSON.stringify(flowData), flowData.nodes.length, new Date().toISOString(), canvasId);

        return {
          name,
          result: {
            created: true,
            iteratorEndNodeId: endNodeId,
            iteratorNodeId,
            message: `Iterator End creado y vinculado. Ahora conecta los nodos del loop body: Iterator (handle "element") → ... → Iterator End. Y conecta la salida del Iterator End al nodo que recibira los resultados acumulados.`,
          },
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

        // Find the node before removing to check for iterator pair cleanup
        const removedNode = flowData.nodes.find((n: Record<string, unknown>) => n.id === nodeId);

        const originalCount = flowData.nodes.length;
        flowData.nodes = flowData.nodes.filter((n: Record<string, unknown>) => n.id !== nodeId);
        if (flowData.nodes.length === originalCount) {
          return { name, result: { error: `Nodo '${nodeId}' no encontrado en el canvas` } };
        }

        flowData.edges = flowData.edges.filter((e: Record<string, unknown>) => e.source !== nodeId && e.target !== nodeId);

        // Clean up ITERATOR ↔ ITERATOR_END pair references
        if (removedNode) {
          const removedData = removedNode.data as Record<string, unknown>;
          if ((removedNode.type as string) === 'iterator_end' && removedData.iteratorId) {
            const pairedIterator = flowData.nodes.find((n: Record<string, unknown>) => n.id === removedData.iteratorId);
            if (pairedIterator) {
              (pairedIterator.data as Record<string, unknown>).iteratorEndId = null;
            }
          }
          if ((removedNode.type as string) === 'iterator' && removedData.iteratorEndId) {
            const pairedEnd = flowData.nodes.find((n: Record<string, unknown>) => n.id === removedData.iteratorEndId);
            if (pairedEnd) {
              (pairedEnd.data as Record<string, unknown>).iteratorId = null;
            }
          }
        }

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
        // Iterator-specific fields
        if (args.separator !== undefined) data.separator = args.separator;
        if (args.limit_mode) data.limit_mode = args.limit_mode;
        if (args.max_rounds !== undefined) data.max_rounds = args.max_rounds;
        if (args.max_time !== undefined) data.max_time = args.max_time;

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

    // ─── Email Template Tools ───
    case 'list_email_templates': {
      const category = args.category as string | undefined;
      let query = 'SELECT id, ref_code, name, description, category, is_active, times_used, created_at, updated_at FROM email_templates';
      const params: unknown[] = [];
      if (category) { query += ' WHERE category = ?'; params.push(category); }
      query += ' ORDER BY updated_at DESC';
      const templates = db.prepare(query).all(...params);
      return { name, result: templates, actions: [{ type: 'navigate', url: '/catpower/templates', label: 'Ver templates →' }] };
    }

    case 'get_email_template': {
      let { templateId } = args as { templateId?: string; templateName?: string; refCode?: string };
      const { templateName, refCode } = args as { templateName?: string; refCode?: string };
      // Tolerant lookup: refCode → name → id
      if (!templateId && refCode) {
        const found = (
          db.prepare('SELECT id FROM email_templates WHERE ref_code = ?').get(refCode) ||
          db.prepare('SELECT id FROM email_templates WHERE name = ?').get(refCode) ||
          db.prepare('SELECT id FROM email_templates WHERE name LIKE ?').get(`%${refCode}%`)
        ) as { id: string } | undefined;
        if (found) templateId = found.id;
      }
      if (!templateId && templateName) {
        const found = (
          db.prepare('SELECT id FROM email_templates WHERE ref_code = ?').get(templateName) ||
          db.prepare('SELECT id FROM email_templates WHERE name LIKE ?').get(`%${templateName}%`)
        ) as { id: string } | undefined;
        if (!found) return { name, result: { error: `Plantilla '${templateName}' no encontrada` } };
        templateId = found.id;
      }
      if (!templateId) return { name, result: { error: 'Se requiere templateId, templateName o refCode' } };
      const tpl = db.prepare('SELECT * FROM email_templates WHERE id = ?').get(templateId) as EmailTemplate | undefined;
      if (!tpl) return { name, result: { error: 'Plantilla no encontrada' } };
      const structure: TemplateStructure = typeof tpl.structure === 'string' ? JSON.parse(tpl.structure) : tpl.structure;
      // Extract instruction keys
      const instructions: string[] = [];
      for (const sKey of ['header', 'body', 'footer'] as const) {
        const sec = structure.sections[sKey];
        if (!sec?.rows) continue;
        for (const row of sec.rows) {
          for (const col of row.columns) {
            if (col.block.type === 'instruction' && (col.block.text || col.block.content)) {
              instructions.push(col.block.text || col.block.content || '');
            }
          }
        }
      }
      const assets = db.prepare('SELECT id, filename, drive_url, mime_type FROM template_assets WHERE template_id = ?').all(templateId);
      return {
        name,
        result: { ...tpl, structure, instructions, assets },
        actions: [{ type: 'navigate', url: `/catpower/templates/${templateId}`, label: 'Abrir editor →' }],
      };
    }

    case 'create_email_template': {
      try {
        const { name: tplName, description, category, structure } = args as {
          name: string; description?: string; category?: string; structure?: TemplateStructure;
        };
        if (!tplName) return { name, result: { error: 'name es obligatorio' } };
        const id = generateId();
        const now = new Date().toISOString();
        const structureStr = structure ? JSON.stringify(structure) : JSON.stringify({
          sections: { header: { rows: [] }, body: { rows: [] }, footer: { rows: [] } },
          styles: { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif', primaryColor: '#7C3AED', textColor: '#333333', maxWidth: 600 },
        });
        db.prepare(
          'INSERT INTO email_templates (id, name, description, category, structure, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(id, tplName, description || null, category || 'general', structureStr, now, now);
        return {
          name,
          result: { id, name: tplName, category: category || 'general', created: true },
          actions: [{ type: 'navigate', url: `/catpower/templates/${id}`, label: 'Abrir editor →' }],
        };
      } catch (err) {
        return { name, result: { error: (err as Error).message } };
      }
    }

    case 'update_email_template': {
      try {
        const { templateId, ...updates } = args as {
          templateId: string; name?: string; description?: string; category?: string;
          is_active?: boolean; structure?: TemplateStructure;
        };
        if (!templateId) return { name, result: { error: 'templateId es obligatorio' } };
        const existing = db.prepare('SELECT id FROM email_templates WHERE id = ?').get(templateId);
        if (!existing) return { name, result: { error: 'Plantilla no encontrada' } };
        const setClauses: string[] = [];
        const values: unknown[] = [];
        if (updates.name !== undefined) { setClauses.push('name = ?'); values.push(updates.name); }
        if (updates.description !== undefined) { setClauses.push('description = ?'); values.push(updates.description); }
        if (updates.category !== undefined) { setClauses.push('category = ?'); values.push(updates.category); }
        if (updates.is_active !== undefined) { setClauses.push('is_active = ?'); values.push(updates.is_active ? 1 : 0); }
        if (updates.structure !== undefined) { setClauses.push('structure = ?'); values.push(JSON.stringify(updates.structure)); }
        if (setClauses.length === 0) return { name, result: { error: 'No hay campos para actualizar' } };
        setClauses.push('updated_at = ?'); values.push(new Date().toISOString());
        values.push(templateId);
        db.prepare(`UPDATE email_templates SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
        return {
          name,
          result: { templateId, updated: true, fields: Object.keys(updates).filter(k => (updates as Record<string, unknown>)[k] !== undefined) },
          actions: [{ type: 'navigate', url: `/catpower/templates/${templateId}`, label: 'Ver plantilla →' }],
        };
      } catch (err) {
        return { name, result: { error: (err as Error).message } };
      }
    }

    case 'delete_email_template': {
      const { templateId } = args as { templateId: string };
      if (!templateId) return { name, result: { error: 'templateId es obligatorio' } };
      const existing = db.prepare('SELECT id, name FROM email_templates WHERE id = ?').get(templateId) as { id: string; name: string } | undefined;
      if (!existing) return { name, result: { error: 'Plantilla no encontrada' } };
      db.prepare('DELETE FROM template_assets WHERE template_id = ?').run(templateId);
      db.prepare('DELETE FROM email_templates WHERE id = ?').run(templateId);
      return { name, result: { deleted: true, templateId, name: existing.name } };
    }

    case 'render_email_template': {
      try {
        const { templateId: rawId, refCode: renderRefCode, variables } = args as { templateId?: string; refCode?: string; variables: Record<string, string> };
        const lookupKey = rawId || renderRefCode;
        if (!lookupKey) return { name, result: { error: 'Se requiere templateId o refCode' } };
        // Tolerant lookup: try as id → ref_code → name
        const tpl = (
          db.prepare('SELECT * FROM email_templates WHERE id = ?').get(lookupKey) ||
          db.prepare('SELECT * FROM email_templates WHERE ref_code = ?').get(lookupKey) ||
          db.prepare('SELECT * FROM email_templates WHERE name = ?').get(lookupKey) ||
          db.prepare('SELECT * FROM email_templates WHERE name LIKE ?').get(`%${lookupKey}%`)
        ) as EmailTemplate | undefined;
        if (!tpl) return { name, result: { error: `Plantilla '${lookupKey}' no encontrada` } };
        let structure: TemplateStructure = typeof tpl.structure === 'string' ? JSON.parse(tpl.structure) : tpl.structure;
        // Resolve local asset URLs to public Drive URLs before rendering
        structure = await resolveAssetsForEmail(tpl.id, structure);
        const { html, text } = renderTemplate(structure, variables);
        // Update times_used
        db.prepare('UPDATE email_templates SET times_used = times_used + 1 WHERE id = ?').run(tpl.id);
        return {
          name,
          result: { html: html.substring(0, 3000) + (html.length > 3000 ? '...[truncado]' : ''), text, template_name: tpl.name, ref_code: tpl.ref_code, html_length: html.length },
        };
      } catch (err) {
        return { name, result: { error: (err as Error).message } };
      }
    }

    case 'get_model_landscape': {
      const detail = (args.detail as string) || 'compact';
      const inventory = await getInventory();
      const midModels = getMidModels({ status: 'active' });
      const aliases = getAllAliases({ active_only: true });
      const availableIds = new Set(inventory.models.map(m => m.model_id));

      // Group by tier
      const modelsByTier: Record<string, Array<{ model_key: string; display_name: string; provider: string; tier: string; best_use: string | null; capabilities: string[]; available: boolean }>> = {};
      for (const m of midModels) {
        const tier = m.tier || 'Unknown';
        if (!modelsByTier[tier]) modelsByTier[tier] = [];
        modelsByTier[tier].push({
          model_key: m.model_key,
          display_name: m.display_name,
          provider: m.provider,
          tier: m.tier,
          best_use: m.best_use,
          capabilities: m.capabilities,
          available: availableIds.has(m.model_key),
        });
      }

      return {
        name,
        result: {
          total_models: inventory.models.length,
          providers: inventory.providers,
          models_by_tier: modelsByTier,
          current_routing: aliases.map(a => ({ alias: a.alias, model: a.model_key, description: a.description })),
          mid_summary: midToMarkdown(detail !== 'full'),
        },
      };
    }

    case 'recommend_model_for_task': {
      const taskDescription = (args.task_description as string) || '';
      const complexity = (args.complexity as string) || 'medium';
      const preferLocal = args.prefer_local === true;

      const midModels = getMidModels({ status: 'active' });
      const inventory = await getInventory();
      const availableIds = new Set(inventory.models.map(m => m.model_id));

      // Filter to available models only
      const available = midModels.filter(m => availableIds.has(m.model_key));

      if (available.length === 0) {
        return { name, result: { error: 'No hay modelos disponibles en Discovery. Verifica el estado de los proveedores.' } };
      }

      // Tier preference based on complexity
      const tierPriority: Record<string, string[]> = {
        low: ['Libre', 'Pro', 'Elite'],
        medium: ['Pro', 'Elite', 'Libre'],
        high: ['Elite', 'Pro', 'Libre'],
      };
      const preferredTiers = tierPriority[complexity] || tierPriority['medium'];

      // Score models
      const scored = available.map(m => {
        let score = 0;
        const tierIndex = preferredTiers.indexOf(m.tier);
        score += tierIndex === 0 ? 30 : tierIndex === 1 ? 20 : 10;
        if (preferLocal && m.provider === 'ollama') score += 15;
        // Boost models with matching capabilities to task keywords
        const taskWords = taskDescription.toLowerCase().split(/\s+/);
        const capStr = (m.capabilities || []).join(' ').toLowerCase() + ' ' + (m.best_use || '').toLowerCase();
        for (const word of taskWords) {
          if (word.length > 3 && capStr.includes(word)) score += 5;
        }
        return { ...m, score };
      });

      scored.sort((a, b) => b.score - a.score);

      const recommended = scored[0];
      const alternatives = scored.slice(1, 3);

      let warning: string | undefined;
      if (complexity === 'low' && recommended.tier === 'Elite') {
        warning = 'Modelo Elite para tarea simple -- considera Pro o Libre para ahorrar costes';
      }

      return {
        name,
        result: {
          recommended: {
            model_key: recommended.model_key,
            display_name: recommended.display_name,
            tier: recommended.tier,
            provider: recommended.provider,
            best_use: recommended.best_use,
            reason: `Mejor match para complejidad "${complexity}"${preferLocal ? ' con preferencia local' : ''}. Tier: ${recommended.tier}.`,
          },
          alternatives: alternatives.map(a => ({
            model_key: a.model_key,
            display_name: a.display_name,
            tier: a.tier,
            provider: a.provider,
          })),
          ...(warning ? { warning } : {}),
        },
      };
    }

    case 'update_alias_routing': {
      const aliasName = args.alias as string;
      const newModel = args.new_model as string;

      if (!aliasName || !newModel) {
        return { name, result: { error: 'Se requieren alias y new_model' } };
      }

      // Verify alias exists
      const allAliases = getAllAliases();
      const existing = allAliases.find(a => a.alias === aliasName);
      if (!existing) {
        return {
          name,
          result: {
            error: `Alias "${aliasName}" no encontrado. Aliases disponibles: ${allAliases.map(a => a.alias).join(', ')}`,
          },
        };
      }

      // Verify model is available in Discovery
      const inventory = await getInventory();
      const availableIds = new Set(inventory.models.map(m => m.model_id));
      if (!availableIds.has(newModel)) {
        return {
          name,
          result: {
            error: `Modelo "${newModel}" no disponible en Discovery. Modelos disponibles: ${inventory.models.map(m => m.model_id).join(', ')}`,
          },
        };
      }

      const previousModel = existing.model_key;
      try {
        updateAlias(aliasName, newModel);
        return {
          name,
          result: {
            success: true,
            alias: aliasName,
            previous_model: previousModel,
            new_model: newModel,
            message: `Alias '${aliasName}' actualizado: ${previousModel} -> ${newModel}`,
          },
        };
      } catch (err) {
        return { name, result: { error: (err as Error).message } };
      }
    }

    default:
      return { name, result: { error: `Tool ${name} no encontrado` } };
  }
}
