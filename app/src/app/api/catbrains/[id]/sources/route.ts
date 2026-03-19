import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { extractContent } from '@/lib/services/content-extractor';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sources = db.prepare('SELECT *, length(content_text) as content_text_length FROM sources WHERE project_id = ? ORDER BY is_pending_append DESC, order_index ASC').all(id);
    return NextResponse.json(sources);
  } catch (error) {
    logger.error('system', 'Error obteniendo fuentes', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: catbrainId } = await params;
    const catbrain = db.prepare('SELECT * FROM catbrains WHERE id = ?').get(catbrainId) as { id: string; rag_enabled: number } | undefined;

    if (!catbrain) {
      return NextResponse.json({ error: 'CatBrain not found' }, { status: 404 });
    }

    const contentType = request.headers.get('content-type') || '';
    const isPendingAppend = catbrain.rag_enabled === 1 ? 1 : 0;

    // Get current max order_index
    const maxOrderRow = db.prepare('SELECT MAX(order_index) as maxOrder FROM sources WHERE project_id = ?').get(catbrainId) as { maxOrder: number | null };
    const nextOrderIndex = (maxOrderRow.maxOrder !== null ? maxOrderRow.maxOrder : -1) + 1;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File;

      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 });
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');

      const projectsPath = process['env']['PROJECTS_PATH'] || path.join(process.cwd(), 'data', 'projects');
      const catbrainDir = path.join(projectsPath, catbrainId);
      const sourcesDir = path.join(catbrainDir, 'sources');

      if (!fs.existsSync(sourcesDir)) {
        fs.mkdirSync(sourcesDir, { recursive: true });
      }

      // Check duplicates by hash
      let isDuplicate = false;
      const files = fs.readdirSync(sourcesDir).filter(f => f.endsWith('.meta.json'));
      for (const metaFile of files) {
        const metaPath = path.join(sourcesDir, metaFile);
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        if (meta.hash === hash) {
          isDuplicate = true;
          break;
        }
      }

      const force = formData.get('force') === 'true';
      if (isDuplicate && !force) {
        return NextResponse.json({ error: 'Duplicate file', hash, isDuplicate: true }, { status: 409 });
      }

      const sourceId = uuidv4();

      // Handle relative paths for folder uploads
      const relativePath = formData.get('relativePath') as string || file.name;
      const ext = path.extname(relativePath);
      const dirName = path.dirname(relativePath);
      const fileName = dirName !== '.' ? path.join(dirName, `${sourceId}${ext}`) : `${sourceId}${ext}`;
      const filePath = path.join(sourcesDir, fileName);

      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, buffer);

      const meta = {
        originalName: relativePath,
        size: file.size,
        mimeType: file.type,
        date: new Date().toISOString(),
        hash
      };

      fs.writeFileSync(path.join(sourcesDir, `${sourceId}.meta.json`), JSON.stringify(meta, null, 2));

      // Extract text content from file
      let contentText: string | null = null;
      let extractionLog: string | null = null;
      try {
        const extraction = await extractContent(filePath);
        if (extraction.text && extraction.method !== 'none') {
          contentText = extraction.text;
        }
        if (extraction.warning) {
          extractionLog = extraction.warning;
        }
      } catch (err) {
        logger.error('system', 'Error extrayendo contenido de fuente', { error: (err as Error).message });
        extractionLog = `Error de extraccion: ${(err as Error).message}`;
      }

      const stmt = db.prepare(`
        INSERT INTO sources (id, project_id, type, name, file_path, file_type, file_size, content_text, extraction_log, status, order_index, is_pending_append)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(sourceId, catbrainId, 'file', relativePath, filePath, file.type, file.size, contentText, extractionLog, 'ready', nextOrderIndex, isPendingAppend);

      const newSource = db.prepare('SELECT * FROM sources WHERE id = ?').get(sourceId);
      return NextResponse.json(newSource, { status: 201 });

    } else if (contentType.includes('application/json')) {
      const body = await request.json();
      const { type, name, url, youtube_id, content_text, description } = body;

      const sourceId = uuidv4();

      const stmt = db.prepare(`
        INSERT INTO sources (id, project_id, type, name, description, url, youtube_id, content_text, status, order_index, is_pending_append)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        sourceId,
        catbrainId,
        type,
        name,
        description || null,
        url || null,
        youtube_id || null,
        content_text || null,
        'ready',
        nextOrderIndex,
        isPendingAppend
      );

      const newSource = db.prepare('SELECT * FROM sources WHERE id = ?').get(sourceId);
      return NextResponse.json(newSource, { status: 201 });
    }

    return NextResponse.json({ error: 'Unsupported content type' }, { status: 415 });
  } catch (error) {
    logger.error('system', 'Error creando fuente', { error: (error as Error).message });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
