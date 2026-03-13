import { NextResponse } from 'next/server';
import db from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { extractContent } from '@/lib/services/content-extractor';
import { logger } from '@/lib/logger';

export async function DELETE(request: Request, { params }: { params: { id: string, sid: string } }) {
  try {
    const source = db.prepare('SELECT * FROM sources WHERE id = ? AND project_id = ?').get(params.sid, params.id) as { type: string, file_path: string, id: string };
    
    if (!source) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    // Delete files if it's a file source
    if (source.type === 'file' && source.file_path) {
      if (fs.existsSync(source.file_path)) {
        fs.unlinkSync(source.file_path);
      }
      
      const metaPath = path.join(path.dirname(source.file_path), `${source.id}.meta.json`);
      if (fs.existsSync(metaPath)) {
        fs.unlinkSync(metaPath);
      }
    }

    db.prepare('DELETE FROM sources WHERE id = ?').run(params.sid);

    logger.info('system', 'Fuente eliminada', { sourceId: params.sid, projectId: params.id });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('system', 'Error eliminando fuente', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string, sid: string } }) {
  try {
    const body = await request.json();
    const { name, description, process_mode, content_text } = body;

    const source = db.prepare('SELECT * FROM sources WHERE id = ? AND project_id = ?').get(params.sid, params.id);
    if (!source) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (content_text !== undefined) { updates.push('content_text = ?'); values.push(content_text); }
    if (process_mode !== undefined && ['process', 'direct', 'exclude'].includes(process_mode)) {
      updates.push('process_mode = ?'); values.push(process_mode);
    }

    if (updates.length === 0) {
      return NextResponse.json(source);
    }

    values.push(params.sid);

    const stmt = db.prepare(`UPDATE sources SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    const updatedSource = db.prepare('SELECT * FROM sources WHERE id = ?').get(params.sid);
    return NextResponse.json(updatedSource);
  } catch (error) {
    logger.error('system', 'Error actualizando fuente', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST /api/projects/[id]/sources/[sid] — re-extract content from file
export async function POST(request: Request, { params }: { params: { id: string, sid: string } }) {
  try {
    const source = db.prepare('SELECT * FROM sources WHERE id = ? AND project_id = ?').get(params.sid, params.id) as {
      id: string; type: string; file_path: string; name: string;
    } | undefined;

    if (!source) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    if (source.type !== 'file' || !source.file_path) {
      return NextResponse.json({ error: 'Only file sources can be re-extracted' }, { status: 400 });
    }

    if (!fs.existsSync(source.file_path)) {
      return NextResponse.json({ error: 'Source file not found on disk' }, { status: 404 });
    }

    const extraction = await extractContent(source.file_path);
    const contentText = extraction.method !== 'none' ? extraction.text : null;
    const extractionLog = extraction.warning || null;

    const now = new Date().toISOString();
    db.prepare('UPDATE sources SET content_text = ?, extraction_log = ?, content_updated_at = ? WHERE id = ?')
      .run(contentText, extractionLog, now, source.id);

    const updated = db.prepare('SELECT * FROM sources WHERE id = ?').get(source.id);
    return NextResponse.json(updated);
  } catch (error) {
    logger.error('system', 'Error re-extrayendo fuente', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
