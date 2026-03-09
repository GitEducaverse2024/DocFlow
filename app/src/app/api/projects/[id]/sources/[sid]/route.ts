import { NextResponse } from 'next/server';
import db from '@/lib/db';
import fs from 'fs';
import path from 'path';

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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting source:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string, sid: string } }) {
  try {
    const body = await request.json();
    const { name, description } = body;

    const source = db.prepare('SELECT * FROM sources WHERE id = ? AND project_id = ?').get(params.sid, params.id);
    if (!source) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }

    if (updates.length === 0) {
      return NextResponse.json(source);
    }

    values.push(params.sid);

    const stmt = db.prepare(`UPDATE sources SET ${updates.join(', ')} WHERE id = ?`);
    stmt.run(...values);

    const updatedSource = db.prepare('SELECT * FROM sources WHERE id = ?').get(params.sid);
    return NextResponse.json(updatedSource);
  } catch (error) {
    console.error('Error updating source:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
