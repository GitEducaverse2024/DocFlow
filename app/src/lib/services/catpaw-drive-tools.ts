/**
 * Google Drive tool definitions for CatPaw tool-calling loop.
 *
 * Generates OpenAI-format tool definitions for each Drive connector
 * linked to a CatPaw. If multiple Drive connectors exist, tool names
 * include the connector name to disambiguate.
 */

interface DriveConnectorInfo {
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
export interface DriveToolDispatch {
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

export function getDriveToolsForPaw(
  pawId: string,
  driveConnectors: DriveConnectorInfo[]
): { tools: ToolDefinition[]; dispatch: Map<string, DriveToolDispatch> } {
  const tools: ToolDefinition[] = [];
  const dispatch = new Map<string, DriveToolDispatch>();
  const usePrefix = driveConnectors.length > 1;

  for (const conn of driveConnectors) {
    const prefix = usePrefix ? `drive_${sanitizeName(conn.connectorName)}_` : 'drive_';
    const accountLabel = conn.connectorName;

    // --- list_files ---
    const listName = `${prefix}list_files`;
    tools.push({
      type: 'function',
      function: {
        name: listName,
        description: `Listar archivos y carpetas en Google Drive de "${accountLabel}". Devuelve nombre, tipo, fecha de modificacion y enlace. Por defecto lista la carpeta raiz configurada.`,
        parameters: {
          type: 'object',
          properties: {
            folder_id: { type: 'string', description: 'ID de la carpeta a listar. Si no se especifica, usa la carpeta raiz del conector.' },
          },
        },
      },
    });
    dispatch.set(listName, { connectorId: conn.connectorId, connectorName: conn.connectorName, operation: 'list_files' });

    // --- search_files ---
    const searchName = `${prefix}search_files`;
    tools.push({
      type: 'function',
      function: {
        name: searchName,
        description: `Buscar archivos en Google Drive de "${accountLabel}" por nombre o contenido. Busca en todo el Drive (o carpeta raiz configurada).`,
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Texto a buscar en nombre o contenido de archivos (ej: "presupuesto 2025", "factura", "acta reunion")' },
            limit: { type: 'number', description: 'Cantidad maxima de resultados (default: 20, max: 50)' },
          },
          required: ['query'],
        },
      },
    });
    dispatch.set(searchName, { connectorId: conn.connectorId, connectorName: conn.connectorName, operation: 'search_files' });

    // --- read_file ---
    const readName = `${prefix}read_file`;
    tools.push({
      type: 'function',
      function: {
        name: readName,
        description: `Leer el contenido de un archivo de Google Drive de "${accountLabel}". Soporta Google Docs, Sheets (CSV), Slides, PDFs y archivos de texto. Usa un fileId obtenido de list_files o search_files.`,
        parameters: {
          type: 'object',
          properties: {
            file_id: { type: 'string', description: 'ID del archivo a leer' },
          },
          required: ['file_id'],
        },
      },
    });
    dispatch.set(readName, { connectorId: conn.connectorId, connectorName: conn.connectorName, operation: 'read_file' });

    // --- get_file_info ---
    const infoName = `${prefix}get_file_info`;
    tools.push({
      type: 'function',
      function: {
        name: infoName,
        description: `Obtener metadatos de un archivo en Google Drive de "${accountLabel}": nombre, tipo, tamano, fecha de modificacion, propietario y enlace.`,
        parameters: {
          type: 'object',
          properties: {
            file_id: { type: 'string', description: 'ID del archivo' },
          },
          required: ['file_id'],
        },
      },
    });
    dispatch.set(infoName, { connectorId: conn.connectorId, connectorName: conn.connectorName, operation: 'get_file_info' });

    // --- upload_file ---
    const uploadName = `${prefix}upload_file`;
    tools.push({
      type: 'function',
      function: {
        name: uploadName,
        description: `Subir/crear un archivo en Google Drive de "${accountLabel}". Devuelve el ID, nombre y enlace web del archivo creado. Ideal para guardar resultados, informes, datos CSV, etc.`,
        parameters: {
          type: 'object',
          properties: {
            file_name: { type: 'string', description: 'Nombre del archivo a crear (ej: "leads-2026-03.csv", "informe.md")' },
            content: { type: 'string', description: 'Contenido del archivo (texto, CSV, JSON, Markdown, etc.)' },
            folder_id: { type: 'string', description: 'ID de la carpeta destino. Si no se especifica, usa la carpeta raiz del conector.' },
            mime_type: { type: 'string', description: 'Tipo MIME del archivo (default: text/plain). Usar text/csv para CSV, application/json para JSON, text/markdown para Markdown.' },
          },
          required: ['file_name', 'content'],
        },
      },
    });
    dispatch.set(uploadName, { connectorId: conn.connectorId, connectorName: conn.connectorName, operation: 'upload_file' });

    // --- create_folder ---
    const createFolderName = `${prefix}create_folder`;
    tools.push({
      type: 'function',
      function: {
        name: createFolderName,
        description: `Crear una carpeta en Google Drive de "${accountLabel}". Devuelve el ID y nombre de la carpeta creada.`,
        parameters: {
          type: 'object',
          properties: {
            folder_name: { type: 'string', description: 'Nombre de la carpeta a crear' },
            parent_folder_id: { type: 'string', description: 'ID de la carpeta padre. Si no se especifica, usa la carpeta raiz del conector.' },
          },
          required: ['folder_name'],
        },
      },
    });
    dispatch.set(createFolderName, { connectorId: conn.connectorId, connectorName: conn.connectorName, operation: 'create_folder' });
  }

  return { tools, dispatch };
}
