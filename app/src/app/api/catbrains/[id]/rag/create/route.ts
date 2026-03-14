import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import db from '@/lib/db';
import { ragJobs } from '@/lib/services/rag-jobs';
import { logUsage } from '@/lib/services/usage-tracker';
import { logger } from '@/lib/logger';
import { createNotification } from '@/lib/services/notifications';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: catbrainId } = await params;
    const body = await request.json();
    const { collectionName, model, chunkSize, chunkOverlap } = body;

    const catbrain = db.prepare('SELECT * FROM catbrains WHERE id = ?').get(catbrainId) as { current_version: number, status: string };
    if (!catbrain) {
      return NextResponse.json({ error: 'CatBrain not found' }, { status: 404 });
    }

    if (catbrain.status !== 'processed' && catbrain.status !== 'rag_indexed') {
      return NextResponse.json({ error: 'CatBrain must be processed first' }, { status: 400 });
    }

    // Check if already running
    const existing = ragJobs.get(catbrainId);
    if (existing && existing.status === 'running') {
      return NextResponse.json({ error: 'Ya hay una indexacion en curso' }, { status: 409 });
    }

    // Create job
    const job = ragJobs.create(catbrainId);
    const ragStartTime = Date.now();
    logger.info('rag', 'Indexacion RAG iniciada', { catbrainId, jobId: job.id, model: model || 'nomic-embed-text', collectionName });

    // Status file for worker communication
    const statusFile = path.join('/tmp', `rag-${catbrainId}.json`);
    fs.writeFileSync(statusFile, JSON.stringify({ status: 'running', progress: 'Iniciando worker...' }));

    const projectsPath = process['env']['PROJECTS_PATH'] || path.join(process.cwd(), 'data', 'projects');
    const qdrantUrl = process['env']['QDRANT_URL'] || 'http://localhost:6333';
    const ollamaUrl = process['env']['OLLAMA_URL'] || 'http://docflow-ollama:11434';

    // Find worker script
    let workerPath = path.join(process.cwd(), 'scripts', 'rag-worker.mjs');
    if (!fs.existsSync(workerPath)) {
      workerPath = path.join(process.cwd(), '..', 'scripts', 'rag-worker.mjs');
    }
    if (!fs.existsSync(workerPath)) {
      ragJobs.fail(catbrainId, 'Worker script not found');
      return NextResponse.json({ error: 'Worker script not found' }, { status: 500 });
    }

    const workerArgs = JSON.stringify({
      projectId: catbrainId,
      version: catbrain.current_version,
      collectionName,
      model: model || 'nomic-embed-text',
      chunkSize: chunkSize || 512,
      chunkOverlap: chunkOverlap || 50,
      statusFile,
      projectsPath,
      qdrantUrl,
      ollamaUrl,
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

    // Poll the status file and update ragJobs
    const pollInterval = setInterval(() => {
      try {
        if (fs.existsSync(statusFile)) {
          const raw = fs.readFileSync(statusFile, 'utf-8');
          const data = JSON.parse(raw);

          if (data.status === 'running') {
            ragJobs.updateProgress(catbrainId, data.progress || 'Procesando...', data.chunksProcessed, data.chunksTotal);
          } else if (data.status === 'completed') {
            clearInterval(pollInterval);
            ragJobs.complete(catbrainId, data.chunksCount || 0);
            // Log usage
            logUsage({
              event_type: 'rag_index',
              project_id: catbrainId,
              model: model || 'nomic-embed-text',
              provider: 'ollama',
              duration_ms: Date.now() - ragStartTime,
              status: 'success',
              metadata: { chunks: data.chunksCount || 0, collection: collectionName }
            });
            // Update DB
            const now = new Date().toISOString();
            db.prepare(`UPDATE catbrains SET rag_enabled = 1, rag_collection = ?, rag_indexed_version = ?, rag_indexed_at = ?, rag_model = ?, status = 'rag_indexed', updated_at = ? WHERE id = ?`)
              .run(collectionName, catbrain.current_version, now, model || 'nomic-embed-text', now, catbrainId);
            logger.info('rag', 'Indexacion RAG completada', { catbrainId, chunks: data.chunksCount || 0 });
            createNotification({
              type: 'rag',
              title: `RAG indexado correctamente`,
              message: `Coleccion indexada para el CatBrain (${data.chunksCount || 0} chunks)`,
              severity: 'success',
              link: `/catbrains/${catbrainId}`,
            });
            // Cleanup
            try { fs.unlinkSync(statusFile); } catch {}
          } else if (data.status === 'error') {
            clearInterval(pollInterval);
            ragJobs.fail(catbrainId, data.error || 'Error desconocido');
            logUsage({
              event_type: 'rag_index',
              project_id: catbrainId,
              model: model || 'nomic-embed-text',
              provider: 'ollama',
              duration_ms: Date.now() - ragStartTime,
              status: 'failed',
              metadata: { error: data.error }
            });
            logger.error('rag', 'Indexacion RAG fallida', { catbrainId, error: data.error });
            createNotification({
              type: 'rag',
              title: `Error indexando RAG`,
              message: `Error: ${data.error || 'Error desconocido'}`.slice(0, 200),
              severity: 'error',
              link: `/catbrains/${catbrainId}`,
            });
            try { fs.unlinkSync(statusFile); } catch {}
          }
        }
      } catch {
        // File read error, keep polling
      }
    }, 1000);

    // Safety timeout: stop polling after 10 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      const currentJob = ragJobs.get(catbrainId);
      if (currentJob && currentJob.status === 'running') {
        ragJobs.fail(catbrainId, 'Timeout: indexacion excedio 10 minutos');
      }
      try { fs.unlinkSync(statusFile); } catch {}
    }, 600000);

    return NextResponse.json({ jobId: job.id, status: 'running' });
  } catch (error: unknown) {
    logger.error('rag', 'Error iniciando indexacion RAG', { error: (error as Error).message });
    return NextResponse.json({ error: (error as Error).message || 'Internal Server Error' }, { status: 500 });
  }
}
