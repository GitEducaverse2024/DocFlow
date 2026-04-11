/**
 * Canvas Connector Contracts (ARCH-DATA-02/03)
 * ------------------------------------------------------------------
 * Declarative contracts for every connector_type supported by
 * `canvas-executor.ts`. Each entry is derived line-by-line from what
 * the executor actually reads from `predecessorOutput` (parsed as
 * `actionData`) or from `node.data`.
 *
 * Rule: if you change a field here WITHOUT syncing `canvas-executor.ts`
 * (or vice versa), the pipeline will break at runtime. The companion
 * unit tests (canvas-connector-contracts.test.ts) block that drift —
 * test 12 is the regression guard.
 *
 * This module is TYPE-ONLY in spirit: it exports constants and pure
 * helpers. No runtime side effects, no imports from other services.
 * That guarantees Plan 03 (scanCanvasResources enrichment) can import
 * it from `canvas-flow-designer.ts` without risk of cycles.
 */

export interface ConnectorAction {
  /** Fields the executor REQUIRES in actionData or node.data for this action. */
  readonly required_fields: readonly string[];
  /** Fields the executor READS but tolerates as missing (defaults or skips). */
  readonly optional_fields: readonly string[];
  /** Human-readable purpose of the action. */
  readonly description: string;
  /** Citation pointing at the executor lines that define this contract. */
  readonly source_line_ref: string;
}

export interface ConnectorContract {
  readonly connector_type: string;
  readonly contracts: Readonly<Record<string, ConnectorAction>>;
}

export const CONNECTOR_CONTRACTS: Readonly<Record<string, ConnectorContract>> = {
  // ---------------------------------------------------------------
  // Gmail — actions discriminated by actionData.accion_final
  // canvas-executor.ts lines ~652..1005
  // ---------------------------------------------------------------
  gmail: {
    connector_type: 'gmail',
    contracts: {
      send_report: {
        required_fields: ['accion_final', 'report_to', 'results'],
        optional_fields: ['report_subject', 'report_template_ref'],
        description:
          'Envía el informe inbound diario al destinatario indicado. ' +
          '`results` es un array de objetos iterator output (respuesta.nombre_lead, ' +
          'respuesta.email_destino, respuesta.producto, destinatario_final, categoria, ' +
          'producto_mencionado, accion_tomada); el executor los renderiza a tabla HTML.',
        source_line_ref: 'canvas-executor.ts:660-1005 (send_report branch ~868-1005)',
      },
      send_reply: {
        required_fields: [
          'accion_final',
          'respuesta.email_destino',
          'respuesta.producto',
        ],
        optional_fields: [
          'messageId',
          'threadId',
          'reply_mode',
          'respuesta.saludo',
          'respuesta.cuerpo',
          'respuesta.asunto',
          'respuesta.plantilla_ref',
        ],
        description:
          'Envía una respuesta por email al lead. `reply_mode` controla si es ' +
          '"REPLY_HILO" (requiere messageId) o "EMAIL_NUEVO" (default). Si existe ' +
          '`respuesta.plantilla_ref`, el executor busca la plantilla en email_templates.',
        source_line_ref: 'canvas-executor.ts:720-860 (send_reply branch)',
      },
      mark_read: {
        required_fields: ['accion_final', 'messageId'],
        optional_fields: [],
        description:
          'Marca un hilo Gmail como leído. Si no hay messageId, el executor ' +
          'salta la operación sin error.',
        source_line_ref: 'canvas-executor.ts:~700-718 (mark_read branch)',
      },
      forward: {
        required_fields: ['accion_final', 'forward_to'],
        optional_fields: [
          'subject',
          'resumen_derivacion',
          'resumen_consulta',
          'body',
          'messageId',
        ],
        description:
          'Reenvía el email a un destinatario humano (default antonio@educa360.com). ' +
          'El cuerpo se toma de resumen_derivacion || resumen_consulta || body. ' +
          'Si messageId existe, marca el original como leído.',
        source_line_ref: 'canvas-executor.ts:705-720 (forward branch)',
      },
    },
  },

  // ---------------------------------------------------------------
  // Google Drive — reads node.data (NOT predecessorOutput)
  // canvas-executor.ts lines ~1009-1088
  // ---------------------------------------------------------------
  google_drive: {
    connector_type: 'google_drive',
    contracts: {
      upload: {
        required_fields: ['drive_operation'],
        optional_fields: ['drive_folder_id', 'drive_file_name'],
        description:
          'Sube un archivo nuevo a Drive. El contenido es el predecessorOutput ' +
          'serializado como string. Lee campos de `node.data`, no de actionData.',
        source_line_ref: 'canvas-executor.ts:1012-1038 (drive upload)',
      },
      download: {
        required_fields: ['drive_operation', 'drive_file_id'],
        optional_fields: ['drive_mime_type'],
        description:
          'Descarga un archivo por id y sobreescribe el output del nodo. ' +
          'drive_mime_type default = application/octet-stream. ' +
          'Lee campos de `node.data`, no de actionData.',
        source_line_ref: 'canvas-executor.ts:~1038-1060 (drive download)',
      },
      list: {
        required_fields: ['drive_operation'],
        optional_fields: ['drive_folder_id'],
        description:
          'Lista archivos del folder indicado. Ignora predecessorOutput y devuelve ' +
          'JSON de listado. Lee campos de `node.data`, no de actionData.',
        source_line_ref: 'canvas-executor.ts:~1060-1080 (drive list)',
      },
      create_folder: {
        required_fields: ['drive_operation', 'drive_file_name'],
        optional_fields: ['drive_folder_id'],
        description:
          'Crea un folder bajo drive_folder_id (default root_folder_id o "root"). ' +
          'Lee campos de `node.data`, no de actionData.',
        source_line_ref: 'canvas-executor.ts:~1080-1088 (drive create_folder)',
      },
    },
  },

  // ---------------------------------------------------------------
  // MCP Server — genérico, reads node.data.tool_name + tool_args
  // Holded vive aquí (tool_name='holded_search_facturas', etc.)
  // canvas-executor.ts lines ~1147-1250
  // ---------------------------------------------------------------
  mcp_server: {
    connector_type: 'mcp_server',
    contracts: {
      invoke_tool: {
        required_fields: ['tool_name'],
        optional_fields: ['tool_args'],
        description:
          'MCP server invoca tool por JSON-RPC; el predecessorOutput se pasa como ' +
          'tool_args.keywords automáticamente. Holded vive aquí ' +
          "(tool_name='holded_search_facturas', 'holded_get_invoice', etc.).",
        source_line_ref: 'canvas-executor.ts:1147-1250 (mcp_server invoke)',
      },
    },
  },

  // ---------------------------------------------------------------
  // Email template — pseudo-connector, usa data.template_id
  // ---------------------------------------------------------------
  email_template: {
    connector_type: 'email_template',
    contracts: {
      render_template: {
        required_fields: [],
        optional_fields: ['template_id'],
        description:
          'Renderiza un email_template resolviendo variables desde el ' +
          'predecessorOutput (JSON). El executor usa data.template_id; si falta, ' +
          'lo deriva del contexto del nodo.',
        source_line_ref: 'canvas-executor.ts (email_template fallback path)',
      },
    },
  },

  // ---------------------------------------------------------------
  // Stubs — completeness, sin uso en holded-q1
  // ---------------------------------------------------------------
  smtp: {
    connector_type: 'smtp',
    contracts: {
      send: {
        required_fields: [],
        optional_fields: [],
        description:
          'Side effect; predecessorOutput se pasa opaco al envío SMTP. ' +
          'No usado en holded-q1 — stub por completeness.',
        source_line_ref: 'canvas-executor.ts (smtp path, unused in v27.0)',
      },
    },
  },

  http_api: {
    connector_type: 'http_api',
    contracts: {
      post: {
        required_fields: [],
        optional_fields: [],
        description:
          'Side effect; predecessorOutput se pasa opaco al POST body. ' +
          'No usado en holded-q1 — stub por completeness.',
        source_line_ref: 'canvas-executor.ts (http_api path, unused in v27.0)',
      },
    },
  },

  n8n_webhook: {
    connector_type: 'n8n_webhook',
    contracts: {
      trigger: {
        required_fields: [],
        optional_fields: [],
        description:
          'Side effect; predecessorOutput se pasa opaco al webhook body. ' +
          'No usado en holded-q1 — stub por completeness.',
        source_line_ref: 'canvas-executor.ts (n8n_webhook path, unused in v27.0)',
      },
    },
  },
} as const;

/**
 * Returns the contract bundle for a given connector_type, or null if unknown.
 * Consumers (scanCanvasResources enrichment in Plan 03) use this to inject
 * the real contract fields into the architect prompt instead of letting the
 * LLM hallucinate field names.
 */
export function getConnectorContracts(
  connectorType: string
): ConnectorContract | null {
  if (!connectorType) return null;
  return CONNECTOR_CONTRACTS[connectorType] ?? null;
}
