import { NextResponse } from 'next/server';
import db from '@/lib/db';
import fs from 'fs';
import path from 'path';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  svg: 'image/svg+xml',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

function getMimeType(filePath: string): string | null {
  const ext = path.extname(filePath).replace('.', '').toLowerCase();
  return MIME_MAP[ext] || null;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; sid: string }> }) {
  try {
    const { id, sid } = await params;
    const body = await request.json();
    const { model } = body;

    if (!model) {
      return NextResponse.json({ error: 'Model is required' }, { status: 400 });
    }

    const source = db.prepare('SELECT * FROM sources WHERE id = ? AND project_id = ?').get(sid, id) as {
      id: string; type: string; file_path: string; name: string; file_size: number;
    } | undefined;

    if (!source) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    if (source.type !== 'file' || !source.file_path) {
      return NextResponse.json({ error: 'Only file sources can be AI-extracted' }, { status: 400 });
    }

    if (!fs.existsSync(source.file_path)) {
      return NextResponse.json({ error: 'Source file not found on disk' }, { status: 404 });
    }

    const stats = fs.statSync(source.file_path);
    if (stats.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `File too large (${(stats.size / 1024 / 1024).toFixed(1)}MB). Max: 20MB` }, { status: 400 });
    }

    const mimeType = getMimeType(source.file_path);
    if (!mimeType) {
      return NextResponse.json({ error: 'Unsupported file type for AI extraction' }, { status: 400 });
    }

    const fileBuffer = fs.readFileSync(source.file_path);
    const base64Data = fileBuffer.toString('base64');

    const litellmUrl = process['env']['LITELLM_URL'] || 'http://localhost:4000';
    const litellmKey = process['env']['LITELLM_API_KEY'] || '';

    const systemPrompt = `Eres un extractor de documentos experto. Tu tarea es extraer TODO el contenido textual del documento proporcionado, preservando:
- Estructura (títulos, secciones, listas)
- Tablas (formato markdown)
- Datos numéricos exactos
- Texto en imágenes (OCR)
- Pies de página y encabezados relevantes

Reglas:
- Devuelve SOLO el texto extraído, sin comentarios ni explicaciones tuyas
- Mantén el idioma original del documento
- Si hay imágenes con texto, transcríbelo
- Si hay gráficos o diagramas, descríbelos brevemente entre [corchetes]
- Preserva el orden de lectura natural del documento`;

    const userContent: Array<Record<string, unknown>> = [
      { type: 'text', text: `Extrae todo el contenido textual de este documento: "${source.name}"` },
    ];

    if (mimeType.startsWith('image/')) {
      userContent.push({
        type: 'image_url',
        image_url: { url: `data:${mimeType};base64,${base64Data}` },
      });
    } else {
      // PDF, DOCX, PPTX, XLSX — send as file via image_url (LiteLLM translates for each provider)
      userContent.push({
        type: 'image_url',
        image_url: { url: `data:${mimeType};base64,${base64Data}` },
      });
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (litellmKey) headers['Authorization'] = `Bearer ${litellmKey}`;

    logger.info('system', 'AI extraction started', {
      sourceId: sid,
      catbrainId: id,
      model,
      fileSize: stats.size,
      mimeType,
    });

    const llmRes = await fetch(`${litellmUrl}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        temperature: 0.1,
        max_tokens: 16000,
      }),
    });

    if (!llmRes.ok) {
      const errText = await llmRes.text();
      logger.error('system', 'AI extraction LLM error', { status: llmRes.status, error: errText });
      return NextResponse.json({ error: `LLM error (${llmRes.status}): ${errText.substring(0, 200)}` }, { status: 502 });
    }

    const llmData = await llmRes.json();
    const extractedText = llmData.choices?.[0]?.message?.content || '';
    const usage = llmData.usage || {};

    if (!extractedText || extractedText.length < 10) {
      return NextResponse.json({ error: 'AI extraction returned empty result' }, { status: 502 });
    }

    const now = new Date().toISOString();
    db.prepare(
      'UPDATE sources SET content_text = ?, extraction_log = NULL, status = ?, content_updated_at = ? WHERE id = ?'
    ).run(extractedText, 'ready', now, source.id);

    const updated = db.prepare('SELECT * FROM sources WHERE id = ?').get(source.id);

    logger.info('system', 'AI extraction completed', {
      sourceId: sid,
      model,
      extractedLength: extractedText.length,
      inputTokens: usage.prompt_tokens,
      outputTokens: usage.completion_tokens,
    });

    return NextResponse.json({
      source: updated,
      ai_extraction: {
        model,
        extracted_length: extractedText.length,
        input_tokens: usage.prompt_tokens || 0,
        output_tokens: usage.completion_tokens || 0,
        total_tokens: usage.total_tokens || 0,
      },
    });
  } catch (error) {
    logger.error('system', 'AI extraction error', { error: (error as Error).message });
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
