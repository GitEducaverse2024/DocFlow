import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { qdrant } from '@/lib/services/qdrant';
import { ollama } from '@/lib/services/ollama';
import fs from 'fs';
import path from 'path';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// MCP Protocol version
const MCP_VERSION = '2024-11-05';

interface McpRequest {
  jsonrpc: '2.0';
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface Project {
  id: string;
  name: string;
  purpose: string;
  tech_stack: string;
  status: string;
  rag_enabled: number;
  rag_collection: string;
  rag_model: string | null;
  current_version: number;
  rag_indexed_version: number | null;
  created_at: string;
}

// ── MCP Tool Definitions ──

const MCP_TOOLS = [
  {
    name: 'search_knowledge',
    description: 'Busca información en la base de conocimiento del CatBrain usando RAG (búsqueda semántica). Devuelve fragmentos relevantes con score de similitud y fuente de origen.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Pregunta o texto a buscar en la documentación del CatBrain' },
        limit: { type: 'number', description: 'Número máximo de resultados (default: 5, max: 20)' },
        min_score: { type: 'number', description: 'Score mínimo de relevancia 0-1 (default: 0.3). Resultados por debajo se descartan.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_project_info',
    description: 'Obtiene metadatos del proyecto: nombre, propósito, stack tecnológico, estado, fuentes y versión',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_document',
    description: 'Obtiene el documento procesado (output) del proyecto en su versión más reciente',
    inputSchema: {
      type: 'object',
      properties: {
        version: { type: 'number', description: 'Versión del documento (default: última versión procesada)' },
      },
    },
  },
];

// ── Tool Execution ──

async function executeSearchKnowledge(project: Project, params: Record<string, unknown>) {
  const query = params.query as string;
  if (!query) throw new Error('query is required');

  const limit = Math.min(Math.max(Number(params.limit) || 5, 1), 20);
  const minScore = typeof params.min_score === 'number' ? params.min_score : 0.3;

  if (!project.rag_enabled || !project.rag_collection) {
    return { error: 'RAG no está habilitado para este CatBrain. Indexa las fuentes primero.' };
  }

  // Use stored model (exact) — fallback to guessing only if not stored
  let embedModel = project.rag_model || 'nomic-embed-text';
  if (!project.rag_model) {
    try {
      const info = await qdrant.getCollectionInfo(project.rag_collection);
      const vectorSize = info?.result?.config?.params?.vectors?.size;
      if (vectorSize) {
        embedModel = ollama.guessModelFromVectorSize(vectorSize);
      }
    } catch { /* use default */ }
  }

  const vector = await ollama.getEmbedding(query, embedModel);
  const searchResult = await qdrant.search(project.rag_collection, vector, limit * 2); // Fetch extra to filter

  const allResults = (searchResult.result || []) as Array<{ score: number; payload?: Record<string, unknown> }>;

  // Filter by score threshold
  const filtered = allResults.filter(p => p.score >= minScore).slice(0, limit);

  const results = filtered.map((point) => ({
    score: point.score,
    source: point.payload?.source_name || point.payload?.source || 'desconocido',
    content: point.payload?.text || point.payload?.content || '',
    metadata: {
      chunk_index: point.payload?.chunk_index,
      source_type: point.payload?.source_type,
      source_id: point.payload?.source_id,
      model: point.payload?.model,
    },
  }));

  return {
    query,
    results_count: results.length,
    total_found: allResults.length,
    min_score: minScore,
    embedding_model: embedModel,
    results,
  };
}

function executeGetProjectInfo(project: Project) {
  const sourcesCount = (db.prepare('SELECT COUNT(*) as c FROM sources WHERE project_id = ?').get(project.id) as { c: number }).c;
  const sources = db.prepare('SELECT name, type, status FROM sources WHERE project_id = ? ORDER BY order_index').all(project.id) as Array<{ name: string; type: string; status: string }>;
  const versionsCount = (db.prepare('SELECT COUNT(*) as c FROM processing_runs WHERE project_id = ? AND status = ?').get(project.id, 'completed') as { c: number }).c;

  return {
    name: project.name,
    purpose: project.purpose || 'No especificado',
    tech_stack: project.tech_stack || 'No especificado',
    status: project.status,
    current_version: project.current_version,
    rag_enabled: !!project.rag_enabled,
    rag_indexed_version: project.rag_indexed_version,
    sources_count: sourcesCount,
    versions_processed: versionsCount,
    sources: sources.map(s => ({ name: s.name, type: s.type, status: s.status })),
    created_at: project.created_at,
  };
}

function executeGetDocument(project: Project, params: Record<string, unknown>) {
  const version = params.version ? Number(params.version) : project.current_version;

  if (version <= 0) {
    return { error: 'Este proyecto aún no tiene documentos procesados.' };
  }

  // Find the processing run for this version
  const run = db.prepare(
    'SELECT output_path, output_format FROM processing_runs WHERE project_id = ? AND version = ? AND status = ? ORDER BY completed_at DESC LIMIT 1'
  ).get(project.id, version, 'completed') as { output_path: string; output_format: string } | undefined;

  if (!run || !run.output_path) {
    return { error: `No se encontró documento procesado para la versión ${version}.` };
  }

  try {
    const content = fs.readFileSync(run.output_path, 'utf-8');
    return {
      version,
      format: run.output_format || 'md',
      content,
      size_bytes: Buffer.byteLength(content, 'utf-8'),
    };
  } catch {
    // Try alternative path patterns
    const dataDir = process['env']['DATABASE_PATH']
      ? path.dirname(process['env']['DATABASE_PATH'])
      : '/app/data';
    const altPath = path.join(dataDir, 'projects', project.id, `output_v${version}.md`);

    try {
      const content = fs.readFileSync(altPath, 'utf-8');
      return {
        version,
        format: 'md',
        content,
        size_bytes: Buffer.byteLength(content, 'utf-8'),
      };
    } catch {
      return { error: `El archivo de output no se encontró en disco (versión ${version}).` };
    }
  }
}

// ── MCP Response Helpers ──

function mcpResult(id: string | number | undefined, result: unknown) {
  return { jsonrpc: '2.0' as const, id, result };
}

function mcpError(id: string | number | undefined, code: number, message: string) {
  return { jsonrpc: '2.0' as const, id, error: { code, message } };
}

// ── Main Handler ──

export async function POST(request: Request, { params }: { params: { projectId: string } }) {
  const projectId = params.projectId;

  // Load project
  const project = db.prepare('SELECT * FROM catbrains WHERE id = ?').get(projectId) as Project | undefined;
  if (!project) {
    return NextResponse.json(
      mcpError(undefined, -32600, `Proyecto no encontrado: ${projectId}`),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: McpRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      mcpError(undefined, -32700, 'Parse error: Invalid JSON'),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { method, id, params: rpcParams } = body;

  logger.info('system', 'Solicitud MCP recibida', { projectId, method });

  try {
    switch (method) {
      // ── Initialize ──
      case 'initialize': {
        return NextResponse.json(mcpResult(id, {
          protocolVersion: MCP_VERSION,
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: `DoCatFlow — ${project.name}`,
            version: '1.0.0',
          },
        }));
      }

      // ── List Tools ──
      case 'tools/list': {
        return NextResponse.json(mcpResult(id, { tools: MCP_TOOLS }));
      }

      // ── Call Tool ──
      case 'tools/call': {
        const toolName = (rpcParams as Record<string, unknown>)?.name as string;
        const toolArgs = ((rpcParams as Record<string, unknown>)?.arguments || {}) as Record<string, unknown>;

        let result: unknown;

        switch (toolName) {
          case 'search_knowledge':
            result = await executeSearchKnowledge(project, toolArgs);
            break;
          case 'get_project_info':
            result = executeGetProjectInfo(project);
            break;
          case 'get_document':
            result = executeGetDocument(project, toolArgs);
            break;
          default:
            return NextResponse.json(mcpError(id, -32601, `Tool no encontrado: ${toolName}`));
        }

        return NextResponse.json(mcpResult(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        }));
      }

      // ── Ping ──
      case 'ping': {
        return NextResponse.json(mcpResult(id, {}));
      }

      // ── Notifications (no response needed but we ACK) ──
      case 'notifications/initialized': {
        return NextResponse.json(mcpResult(id, {}));
      }

      default:
        return NextResponse.json(mcpError(id, -32601, `Method not found: ${method}`));
    }
  } catch (error) {
    logger.error('system', `Error MCP [${method}]`, { error: (error as Error).message, projectId });
    return NextResponse.json(
      mcpError(id, -32603, (error as Error).message || 'Internal error'),
      { status: 500 }
    );
  }
}

// ── GET: Discovery endpoint ──
export async function GET(request: Request, { params }: { params: { projectId: string } }) {
  const projectId = params.projectId;

  const project = db.prepare('SELECT id, name, purpose, rag_enabled, rag_collection FROM catbrains WHERE id = ?').get(projectId) as { id: string; name: string; purpose: string; rag_enabled: number; rag_collection: string } | undefined;

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const baseUrl = process['env']['NEXTAUTH_URL'] || `http://localhost:${process['env']['PORT'] || 3000}`;

  return NextResponse.json({
    name: `DoCatFlow — ${project.name}`,
    description: project.purpose || `Base de conocimiento del proyecto ${project.name}`,
    version: '1.0.0',
    protocol: MCP_VERSION,
    endpoint: `${baseUrl}/api/mcp/${projectId}`,
    tools: MCP_TOOLS.map(t => ({ name: t.name, description: t.description })),
    rag_enabled: !!project.rag_enabled,
    rag_collection: project.rag_collection || null,
  });
}
