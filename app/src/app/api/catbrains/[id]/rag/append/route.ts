import { NextResponse } from 'next/server';
import crypto from 'crypto';
import db from '@/lib/db';
import { qdrant } from '@/lib/services/qdrant';
import { logger } from '@/lib/logger';
import { extractContent } from '@/lib/services/content-extractor';
import { generateId } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const BATCH_SIZE = 16;
const UPSERT_BATCH = 64;

interface SourceRow {
  id: string;
  name: string;
  type: string;
  content_text: string | null;
  file_path: string | null;
}

interface CatBrainRow {
  id: string;
  rag_enabled: number;
  rag_collection: string | null;
  rag_model: string | null;
  current_version: number;
  status: string;
}

function sanitizeText(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\uD800-\uDFFF]/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ')
    .replace(/[ \t]{4,}/g, '  ');
}

/** Deterministic UUID v5-like from sourceId + chunk index */
function chunkPointId(sourceId: string, chunkIndex: number): string {
  const input = `${sourceId}_chunk_${chunkIndex}`;
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  // Format as UUID: 8-4-4-4-12
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16), // version 4
    ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20), // variant
    hash.slice(20, 32),
  ].join('-');
}

function smartChunkText(text: string, baseSize: number = 512, overlap: number = 50): { text: string; content_type: string }[] {
  const chunks: { text: string; content_type: string }[] = [];
  const clean = sanitizeText(text);
  if (!clean || clean.trim().length < 10) return chunks;

  let i = 0;
  while (i < clean.length && chunks.length < 50000) {
    let end = Math.min(i + baseSize, clean.length);
    if (end < clean.length) {
      let bp = clean.lastIndexOf('\n\n', end);
      if (bp <= i) bp = clean.lastIndexOf('\n', end);
      if (bp <= i) bp = clean.lastIndexOf('. ', end);
      if (bp <= i) bp = clean.lastIndexOf(' ', end);
      if (bp > i) end = bp + 1;
    }
    const chunk = clean.slice(i, end).trim();
    if (chunk.length > 10) {
      const hasCode = /```|^\s{4}\S/m.test(chunk);
      const hasList = /^[\s]*[-*]\s/m.test(chunk);
      chunks.push({
        text: chunk,
        content_type: hasCode ? 'dense' : hasList ? 'list' : 'narrative',
      });
    }
    const nextI = end - overlap;
    i = nextI > i ? nextI : end;
  }
  return chunks;
}

async function batchEmbed(texts: string[], model: string): Promise<number[][]> {
  const OLLAMA_URL = process['env']['OLLAMA_URL'] || 'http://docflow-ollama:11434';
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: texts }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Ollama embedding error (${res.status}): ${err}`);
  }
  const data = await res.json();
  if (data.embeddings && data.embeddings.length > 0) return data.embeddings;
  if (data.embedding) return [data.embedding];
  throw new Error('No embeddings returned');
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: catbrainId } = await params;
    const body = await request.json();
    const { sourceIds } = body as { sourceIds: string[] };

    if (!sourceIds || !Array.isArray(sourceIds) || sourceIds.length === 0) {
      return NextResponse.json({ error: 'sourceIds array is required' }, { status: 400 });
    }

    const catbrain = db.prepare('SELECT * FROM catbrains WHERE id = ?').get(catbrainId) as CatBrainRow | undefined;
    if (!catbrain) {
      return NextResponse.json({ error: 'CatBrain not found' }, { status: 404 });
    }

    if (!catbrain.rag_enabled || !catbrain.rag_collection) {
      return NextResponse.json({ error: 'RAG no está activo en este CatBrain. Indexa primero.' }, { status: 400 });
    }

    const collectionName = catbrain.rag_collection;
    const model = catbrain.rag_model || 'nomic-embed-text';

    // Verify collection exists
    const collInfo = await qdrant.getCollectionInfo(collectionName);
    if (!collInfo) {
      return NextResponse.json({ error: 'Colección RAG no encontrada en Qdrant' }, { status: 400 });
    }

    // Fetch sources
    const placeholders = sourceIds.map(() => '?').join(',');
    const sources = db.prepare(
      `SELECT id, name, type, content_text, file_path FROM sources WHERE id IN (${placeholders}) AND project_id = ?`
    ).all(...sourceIds, catbrainId) as SourceRow[];

    if (sources.length === 0) {
      return NextResponse.json({ error: 'No se encontraron fuentes válidas' }, { status: 404 });
    }

    logger.info('rag', 'Append RAG iniciado', { catbrainId, sourceCount: sources.length, collection: collectionName });

    // Try to extract content for sources missing content_text
    const extractionFailures: { name: string; reason: string }[] = [];
    for (const source of sources) {
      const hasContent = source.content_text && source.content_text.trim().length >= 5;
      if (hasContent) continue;

      // Only file sources can be re-extracted from disk
      if (source.type === 'file' && source.file_path) {
        try {
          const extraction = await extractContent(source.file_path);
          if (extraction.text && extraction.method !== 'none') {
            db.prepare('UPDATE sources SET content_text = ?, status = ? WHERE id = ?')
              .run(extraction.text, 'ready', source.id);
            source.content_text = extraction.text;
            logger.info('rag', 'Re-extraído contenido para append', { sourceId: source.id, chars: extraction.text.length });
          } else {
            // Extraction returned method 'none' (image, binary, or error)
            const reason = extraction.warning || `Extracción devolvió method=${extraction.method}`;
            logger.warn('rag', 'Extracción sin contenido útil', {
              sourceId: source.id,
              name: source.name,
              method: extraction.method,
              warning: extraction.warning,
            });
            // Fallback: use file name as minimal content so the source isn't lost
            const fallbackText = `Archivo: ${source.name}`;
            db.prepare('UPDATE sources SET content_text = ?, status = ? WHERE id = ?')
              .run(fallbackText, 'ready', source.id);
            source.content_text = fallbackText;
            extractionFailures.push({ name: source.name, reason: `Contenido mínimo (nombre) — ${reason}` });
          }
        } catch (err) {
          const reason = (err as Error).message;
          logger.warn('rag', 'Error re-extrayendo contenido', { sourceId: source.id, name: source.name, error: reason });
          // Fallback: use file name
          const fallbackText = `Archivo: ${source.name}`;
          db.prepare('UPDATE sources SET content_text = ?, status = ? WHERE id = ?')
            .run(fallbackText, 'ready', source.id);
          source.content_text = fallbackText;
          extractionFailures.push({ name: source.name, reason });
        }
      } else if (source.type !== 'file') {
        // Non-file source (url, youtube, note) without content — can't re-extract
        extractionFailures.push({ name: source.name, reason: `Fuente tipo "${source.type}" sin content_text` });
      } else {
        // File source without file_path
        extractionFailures.push({ name: source.name, reason: 'Fuente tipo file sin file_path en DB' });
      }
    }

    if (extractionFailures.length > 0) {
      logger.warn('rag', 'Algunas fuentes tuvieron problemas de extracción', {
        catbrainId,
        failures: extractionFailures,
      });
    }

    // Filter sources with content
    const sourcesWithContent = sources.filter(s => s.content_text && s.content_text.trim().length >= 5);
    if (sourcesWithContent.length === 0) {
      const details = extractionFailures.map(f => `• ${f.name}: ${f.reason}`).join('\n');
      return NextResponse.json({
        error: `Ninguna fuente tiene contenido de texto extraído.\n${details || 'Sin detalles de extracción.'}`,
        failures: extractionFailures,
      }, { status: 400 });
    }

    // Chunk all sources
    const allChunks: { text: string; content_type: string; source_id: string; source_name: string; source_type: string; local_index: number }[] = [];
    for (const source of sourcesWithContent) {
      const chunks = smartChunkText(source.content_text!);
      for (let ci = 0; ci < chunks.length; ci++) {
        allChunks.push({
          ...chunks[ci],
          source_id: source.id,
          source_name: source.name,
          source_type: source.type,
          local_index: ci,
        });
      }
    }

    if (allChunks.length === 0) {
      return NextResponse.json({ error: 'No se generaron chunks del contenido' }, { status: 400 });
    }

    // Embed and upsert in batches
    let totalVectors = 0;
    for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
      const batch = allChunks.slice(i, i + BATCH_SIZE);
      const texts = batch.map(c => c.text);

      let embeddings: number[][];
      try {
        embeddings = await batchEmbed(texts, model);
      } catch {
        // Fallback to single
        embeddings = [];
        for (const t of texts) {
          try {
            const embs = await batchEmbed([t], model);
            embeddings.push(embs[0]);
          } catch {
            logger.warn('rag', 'Single embed failed, skipping chunk');
            embeddings.push([]);
          }
        }
      }

      const points = [];
      for (let j = 0; j < batch.length; j++) {
        if (embeddings[j] && embeddings[j].length > 0) {
          const chunk = batch[j];
          const chunkText = sanitizeText(chunk.text);
          points.push({
            id: chunkPointId(chunk.source_id, chunk.local_index),
            vector: embeddings[j],
            payload: {
              project_id: catbrainId,
              chunk_index: i + j,
              total_chunks: allChunks.length,
              text: chunkText,
              source_name: chunk.source_name,
              source_type: chunk.source_type,
              source_id: chunk.source_id,
              model,
              content_type: chunk.content_type,
              section_path: '',
              section_title: '',
              section_level: 0,
              chunk_hash: crypto.createHash('sha256').update(chunkText).digest('hex').slice(0, 16),
              indexed_at: new Date().toISOString(),
              append: true,
            },
          });
        }
      }

      // Upsert to Qdrant in sub-batches
      for (let u = 0; u < points.length; u += UPSERT_BATCH) {
        const upsertBatch = points.slice(u, u + UPSERT_BATCH);
        await qdrant.upsertPoints(collectionName, upsertBatch);
      }
      totalVectors += points.length;
    }

    // Mark sources as appended
    const updateStmt = db.prepare('UPDATE sources SET is_pending_append = 0 WHERE id = ?');
    for (const source of sourcesWithContent) {
      updateStmt.run(source.id);
    }

    // Register in processing_runs
    try {
      const runId = generateId();
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO processing_runs (id, project_id, version, status, input_sources, output_format, started_at, completed_at)
        VALUES (?, ?, ?, 'completed', ?, 'append', ?, ?)
      `).run(
        runId,
        catbrainId,
        catbrain.current_version || 1,
        `append +${sourcesWithContent.length} fuentes (${totalVectors} vectores)`,
        now,
        now
      );
    } catch (err) {
      logger.warn('rag', 'No se pudo registrar processing_run de append', { error: (err as Error).message });
    }

    logger.info('rag', 'Append RAG completado', { catbrainId, vectors: totalVectors, sources: sourcesWithContent.length });

    return NextResponse.json({
      ok: true,
      vectors_added: totalVectors,
      sources_processed: sourcesWithContent.length,
      collection: collectionName,
    });
  } catch (error: unknown) {
    logger.error('rag', 'Error en append RAG', { error: (error as Error).message });
    return NextResponse.json({ error: (error as Error).message || 'Internal Server Error' }, { status: 500 });
  }
}
