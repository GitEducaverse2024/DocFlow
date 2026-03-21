import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import db from '@/lib/db';
import { ragJobs } from '@/lib/services/rag-jobs';
import { logUsage } from '@/lib/services/usage-tracker';
import { logger } from '@/lib/logger';
import { createNotification } from '@/lib/services/notifications';
import { createSSEStream, sseHeaders } from '@/lib/services/stream-utils';

export const dynamic = 'force-dynamic';

// Pre-flight validation: check Ollama, embedding model, Qdrant
async function preflight(ollamaUrl: string, qdrantUrl: string, model: string): Promise<string | null> {
  // 1. Check Ollama responds
  try {
    const res = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return `Ollama no responde (HTTP ${res.status}). Verifica que el servicio esté activo en ${ollamaUrl}`;
    const tags = await res.json();
    const models = (tags.models || []).map((m: { name: string }) => m.name.split(':')[0]);
    // 2. Check embedding model exists (worker will auto-pull, but warn)
    if (!models.includes(model)) {
      // Not a hard error — worker will pull it. Just log.
      logger.info('rag', `Modelo ${model} no encontrado localmente, el worker lo descargara`, { ollamaUrl, model });
    }
  } catch {
    return `Ollama no disponible en ${ollamaUrl}. Verifica que el servicio esté activo.`;
  }

  // 3. Check Qdrant responds
  try {
    const res = await fetch(`${qdrantUrl}/collections`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return `Qdrant no responde (HTTP ${res.status}). Verifica que el servicio esté activo en ${qdrantUrl}`;
  } catch {
    return `Qdrant no disponible en ${qdrantUrl}. Verifica que el servicio esté activo.`;
  }

  return null; // All OK
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: catbrainId } = await params;
    const body = await request.json();
    const { collectionName, model, chunkSize, chunkOverlap, truncateDim } = body;
    const useStream = body.stream === true;

    const catbrain = db.prepare('SELECT * FROM catbrains WHERE id = ?').get(catbrainId) as { current_version: number, status: string, name: string } | undefined;
    if (!catbrain) {
      return NextResponse.json({ error: 'CatBrain not found' }, { status: 404 });
    }

    if (catbrain.status !== 'processed' && catbrain.status !== 'rag_indexed') {
      return NextResponse.json({ error: 'CatBrain must be processed first' }, { status: 400 });
    }

    const embModel = model || 'nomic-embed-text';
    const projectsPath = process['env']['PROJECTS_PATH'] || path.join(process.cwd(), 'data', 'projects');
    const qdrantUrl = process['env']['QDRANT_URL'] || 'http://localhost:6333';
    const ollamaUrl = process['env']['OLLAMA_URL'] || 'http://docflow-ollama:11434';

    // Check if already running — if streaming, attach to existing job
    const existing = ragJobs.get(catbrainId);
    const isReconnect = existing && existing.status === 'running';

    if (isReconnect && !useStream) {
      return NextResponse.json({ error: 'Ya hay una indexacion en curso' }, { status: 409 });
    }

    // Pre-flight validation (skip on reconnect — worker is already running)
    if (!isReconnect) {
      const preflightError = await preflight(ollamaUrl, qdrantUrl, embModel);
      if (preflightError) {
        logger.error('rag', 'Preflight failed', { catbrainId, error: preflightError });
        return NextResponse.json({ error: preflightError }, { status: 503 });
      }
    }

    // Status file for worker communication
    const statusFile = path.join('/tmp', `rag-${catbrainId}.json`);

    // Spawn worker only if not reconnecting
    if (!isReconnect) {
      const job = ragJobs.create(catbrainId);
      const ragStartTime = Date.now();
      logger.info('rag', 'Indexacion RAG iniciada', { catbrainId, jobId: job.id, model: embModel, collectionName });

      fs.writeFileSync(statusFile, JSON.stringify({ status: 'running', progress: 'Iniciando worker...' }));

      // Find worker script
      let workerPath = path.join(process.cwd(), 'scripts', 'rag-worker.mjs');
      if (!fs.existsSync(workerPath)) {
        workerPath = path.join(process.cwd(), '..', 'scripts', 'rag-worker.mjs');
      }
      if (!fs.existsSync(workerPath)) {
        ragJobs.fail(catbrainId, 'Worker script not found');
        return NextResponse.json({ error: 'Worker script not found' }, { status: 500 });
      }

      // Fetch source names for metadata attribution
      const sources = db.prepare('SELECT id, name, type FROM sources WHERE project_id = ? ORDER BY order_index').all(catbrainId) as { id: string; name: string; type: string }[];

      const workerArgs = JSON.stringify({
        projectId: catbrainId,
        version: catbrain.current_version,
        collectionName,
        model: embModel,
        chunkSize: chunkSize || 512,
        chunkOverlap: chunkOverlap || 50,
        truncateDim: truncateDim || undefined,
        statusFile,
        projectsPath,
        qdrantUrl,
        ollamaUrl,
        sourcesMetadata: sources.map(s => ({ id: s.id, name: s.name, type: s.type })),
      });

      // Spawn worker in separate process with limited memory
      const child = spawn('node', ['--max-old-space-size=1024', workerPath, workerArgs], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      });

      child.stdout?.on('data', (data: Buffer) => {
        logger.info('rag', 'RAG worker stdout', { catbrainId, output: data.toString().trim() });
      });

      child.stderr?.on('data', (data: Buffer) => {
        logger.warn('rag', 'RAG worker stderr', { catbrainId, output: data.toString().trim() });
      });

      child.unref();

      // Safety timeout: scale with source count (base 10min + 3s per source, max 60min)
      const baseTimeoutMs = 600_000;
      const perSourceMs = 3_000;
      const dynamicTimeoutMs = Math.min(baseTimeoutMs + sources.length * perSourceMs, 3_600_000);
      logger.info('rag', 'Timeout configurado', { catbrainId, sources: sources.length, timeoutMin: Math.round(dynamicTimeoutMs / 60_000) });

      // Background timeout — marks job as failed if worker doesn't finish
      setTimeout(() => {
        const currentJob = ragJobs.get(catbrainId);
        if (currentJob && currentJob.status === 'running') {
          let workerStillActive = false;
          try {
            if (fs.existsSync(statusFile)) {
              const raw = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
              workerStillActive = raw.updatedAt && (Date.now() - raw.updatedAt) < 60_000;
            }
          } catch { /* ignore */ }

          if (workerStillActive) {
            logger.warn('rag', 'Worker aun activo al timeout, extendiendo 5min', { catbrainId });
            setTimeout(() => {
              const j = ragJobs.get(catbrainId);
              if (j && j.status === 'running') {
                ragJobs.fail(catbrainId, `Timeout: indexacion excedio ${Math.round((dynamicTimeoutMs + 300_000) / 60_000)} minutos`);
              }
              try { fs.unlinkSync(statusFile); } catch {}
            }, 300_000);
          } else {
            ragJobs.fail(catbrainId, `Timeout: indexacion excedio ${Math.round(dynamicTimeoutMs / 60_000)} minutos`);
            try { fs.unlinkSync(statusFile); } catch {}
          }
        }
      }, dynamicTimeoutMs);

      // Store ragStartTime for later use in completion handler
      const jobRef = ragJobs.get(catbrainId) as unknown as Record<string, unknown>;
      jobRef._startTime = ragStartTime;
      jobRef._collectionName = collectionName;
      jobRef._model = embModel;
      jobRef._version = catbrain.current_version;
      jobRef._sourcesCount = sources.length;
    }

    // If not streaming, return JSON (backward compat)
    if (!useStream) {
      return NextResponse.json({ jobId: ragJobs.get(catbrainId)?.id, status: 'running' });
    }

    // SSE stream: poll status file and forward progress to client
    const stream = createSSEStream((send, close) => {
      send('start', { jobId: ragJobs.get(catbrainId)?.id, reconnect: !!isReconnect });

      let lastProgress = '';
      const pollInterval = setInterval(() => {
        try {
          if (!fs.existsSync(statusFile)) {
            // Status file gone — check ragJobs for final state
            const job = ragJobs.get(catbrainId);
            if (!job || job.status !== 'running') {
              clearInterval(pollInterval);
              if (job?.status === 'completed') {
                send('done', { chunksCount: job.chunksCount || 0 });
              } else if (job?.status === 'error') {
                send('error', { message: job.error || 'Error desconocido' });
              }
              close();
            }
            return;
          }

          const raw = fs.readFileSync(statusFile, 'utf-8');
          const data = JSON.parse(raw);

          if (data.status === 'running') {
            // Only send if progress changed
            const progressKey = `${data.chunksProcessed}:${data.progress}`;
            if (progressKey !== lastProgress) {
              lastProgress = progressKey;
              ragJobs.updateProgress(catbrainId, data.progress || 'Procesando...', data.chunksProcessed, data.chunksTotal);
              send('stage', {
                stage: 'progress',
                message: data.progress || 'Procesando...',
                chunksProcessed: data.chunksProcessed || 0,
                chunksTotal: data.chunksTotal || 0,
                currentSource: data.currentSource || null,
                percent: data.percent || 0,
                elapsed: data.elapsed || 0,
              });
            }
          } else if (data.status === 'completed') {
            clearInterval(pollInterval);
            const jobMeta = ragJobs.get(catbrainId) as unknown as Record<string, unknown> | undefined;
            const startTime = (jobMeta?._startTime as number) || Date.now();
            const cName = (jobMeta?._collectionName as string) || collectionName;
            const mName = (jobMeta?._model as string) || embModel;
            const ver = (jobMeta?._version as number) || catbrain.current_version;

            ragJobs.complete(catbrainId, data.chunksCount || 0);
            logUsage({
              event_type: 'rag_index',
              project_id: catbrainId,
              model: mName,
              provider: 'ollama',
              duration_ms: Date.now() - startTime,
              status: 'success',
              metadata: { chunks: data.chunksCount || 0, collection: cName }
            });
            const now = new Date().toISOString();
            db.prepare(`UPDATE catbrains SET rag_enabled = 1, rag_collection = ?, rag_indexed_version = ?, rag_indexed_at = ?, rag_model = ?, status = 'rag_indexed', updated_at = ? WHERE id = ?`)
              .run(cName, ver, now, mName, now, catbrainId);
            logger.info('rag', 'Indexacion RAG completada', { catbrainId, chunks: data.chunksCount || 0 });
            createNotification({
              type: 'rag',
              title: 'RAG indexado correctamente',
              message: `Coleccion indexada para el CatBrain (${data.chunksCount || 0} chunks)`,
              severity: 'success',
              link: `/catbrains/${catbrainId}`,
            });
            try { fs.unlinkSync(statusFile); } catch {}

            send('done', {
              chunksCount: data.chunksCount || 0,
              duration: data.duration,
              vectorSize: data.vectorSize,
            });
            close();
          } else if (data.status === 'error') {
            clearInterval(pollInterval);
            const jobMeta = ragJobs.get(catbrainId) as unknown as Record<string, unknown> | undefined;
            const startTime = (jobMeta?._startTime as number) || Date.now();
            const mName = (jobMeta?._model as string) || embModel;

            ragJobs.fail(catbrainId, data.error || 'Error desconocido');
            logUsage({
              event_type: 'rag_index',
              project_id: catbrainId,
              model: mName,
              provider: 'ollama',
              duration_ms: Date.now() - startTime,
              status: 'failed',
              metadata: { error: data.error }
            });
            logger.error('rag', 'Indexacion RAG fallida', { catbrainId, error: data.error });
            createNotification({
              type: 'rag',
              title: 'Error indexando RAG',
              message: `Error: ${data.error || 'Error desconocido'}`.slice(0, 200),
              severity: 'error',
              link: `/catbrains/${catbrainId}`,
            });
            try { fs.unlinkSync(statusFile); } catch {}

            send('error', {
              message: data.error || 'Error desconocido',
              errorType: data.errorType || 'unknown',
              currentSource: data.currentSource || null,
              chunksCompleted: data.chunksCompleted || 0,
              chunksTotal: data.chunksTotal || 0,
              stackTrace: data.stackTrace || null,
            });
            close();
          }
        } catch {
          // File read/parse error — keep polling
        }
      }, 1000);

      // Safety: close SSE stream after 65 min max (worker timeout is 60 min max + 5 min extension)
      setTimeout(() => {
        clearInterval(pollInterval);
        const job = ragJobs.get(catbrainId);
        if (job && job.status === 'running') {
          send('error', { message: 'Timeout: la conexion SSE se cerro tras 65 minutos' });
        }
        close();
      }, 3_900_000);
    });

    return new Response(stream, { headers: sseHeaders });
  } catch (error: unknown) {
    logger.error('rag', 'Error iniciando indexacion RAG', { error: (error as Error).message });
    return NextResponse.json({ error: (error as Error).message || 'Internal Server Error' }, { status: 500 });
  }
}
