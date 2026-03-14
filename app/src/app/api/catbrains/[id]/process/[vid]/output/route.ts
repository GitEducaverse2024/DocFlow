import { NextResponse } from 'next/server';
import db from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { logger } from '@/lib/logger';

export async function GET(request: Request, { params }: { params: Promise<{ id: string, vid: string }> }) {
  try {
    const { id, vid } = await params;
    
    const run = db.prepare('SELECT * FROM processing_runs WHERE project_id = ? AND version = ?').get(id, vid) as { status: string, output_path: string };
    
    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }

    if (run.status !== 'completed') {
      return NextResponse.json({ error: 'Process not completed' }, { status: 400 });
    }

    if (!run.output_path) {
      return NextResponse.json({ error: 'Output path not found' }, { status: 404 });
    }

    const mdPath = path.join(run.output_path, 'output.md');
    
    if (!fs.existsSync(mdPath)) {
      return NextResponse.json({ error: 'Output file not found' }, { status: 404 });
    }

    const content = fs.readFileSync(mdPath, 'utf-8');
    
    return NextResponse.json({ content });
  } catch (error) {
    logger.error('processing', 'Error obteniendo output', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
