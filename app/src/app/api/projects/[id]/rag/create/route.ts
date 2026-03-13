import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import db from '@/lib/db';
import { ragJobs } from '@/lib/services/rag-jobs';
import { logUsage } from '@/lib/services/usage-tracker';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const projectId = params.id;
    const body = await request.json();
    const { collectionName, model, chunkSize, chunkOverlap } = body;

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as { current_version: number, status: string };
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.status !== 'processed' && project.status !== 'rag_indexed') {
      return NextResponse.json({ error: 'Project must be processed first' }, { status: 400 });
    }

    // Check if already running
    const existing = ragJobs.get(projectId);
    if (existing && existing.status === 'running') {
      return NextResponse.json({ error: 'Ya hay una indexacion en curso' }, { status: 409 });
    }

    // Create job
    const job = ragJobs.create(projectId);
    const ragStartTime = Date.now();
    logger.info('rag', 'Indexacion RAG iniciada', { projectId, jobId: job.id, model: model || 'nomic-embed-text', collectionName });

    // Status file for worker communication
    const statusFile = path.join('/tmp', `rag-${projectId}.json`);
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
      ragJobs.fail(projectId, 'Worker script not found');
      return NextResponse.json({ error: 'Worker script not found' }, { status: 500 });
    }

    const workerArgs = JSON.stringify({
      projectId,
      version: project.current_version,
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
      logger.info('rag', 'RAG worker stdout', { projectId, output: data.toString().trim() });
    });

    child.stderr?.on('data', (data: Buffer) => {
      logger.warn('rag', 'RAG worker stderr', { projectId, output: data.toString().trim() });
    });

    child.unref();

    // Poll the status file and update ragJobs
    const pollInterval = setInterval(() => {
      try {
        if (fs.existsSync(statusFile)) {
          const raw = fs.readFileSync(statusFile, 'utf-8');
          const data = JSON.parse(raw);

          if (data.status === 'running') {
            ragJobs.updateProgress(projectId, data.progress || 'Procesando...', data.chunksProcessed, data.chunksTotal);
          } else if (data.status === 'completed') {
            clearInterval(pollInterval);
            ragJobs.complete(projectId, data.chunksCount || 0);
            // Log usage (USAGE-03)
            logUsage({
              event_type: 'rag_index',
              project_id: projectId,
              model: model || 'nomic-embed-text',
              provider: 'ollama',
              duration_ms: Date.now() - ragStartTime,
              status: 'success',
              metadata: { chunks: data.chunksCount || 0, collection: collectionName }
            });
            // Update DB
            const now = new Date().toISOString();
            db.prepare(`UPDATE projects SET rag_enabled = 1, rag_collection = ?, rag_indexed_version = ?, rag_indexed_at = ?, rag_model = ?, status = 'rag_indexed', updated_at = ? WHERE id = ?`)
              .run(collectionName, project.current_version, now, model || 'nomic-embed-text', now, projectId);
            logger.info('rag', 'Indexacion RAG completada', { projectId, chunks: data.chunksCount || 0 });
            // Cleanup
            try { fs.unlinkSync(statusFile); } catch {}
          } else if (data.status === 'error') {
            clearInterval(pollInterval);
            ragJobs.fail(projectId, data.error || 'Error desconocido');
            logUsage({
              event_type: 'rag_index',
              project_id: projectId,
              model: model || 'nomic-embed-text',
              provider: 'ollama',
              duration_ms: Date.now() - ragStartTime,
              status: 'failed',
              metadata: { error: data.error }
            });
            logger.error('rag', 'Indexacion RAG fallida', { projectId, error: data.error });
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
      const currentJob = ragJobs.get(projectId);
      if (currentJob && currentJob.status === 'running') {
        ragJobs.fail(projectId, 'Timeout: indexacion excedio 10 minutos');
      }
      try { fs.unlinkSync(statusFile); } catch {}
    }, 600000);

    return NextResponse.json({ jobId: job.id, status: 'running' });
  } catch (error: unknown) {
    logger.error('rag', 'Error iniciando indexacion RAG', { error: (error as Error).message });
    return NextResponse.json({ error: (error as Error).message || 'Internal Server Error' }, { status: 500 });
  }
}
