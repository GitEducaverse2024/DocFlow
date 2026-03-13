import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const LOG_DIR = process['env']['LOG_DIR'] || '/app/data/logs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    const logFile = path.join(LOG_DIR, `app-${date}.jsonl`);

    if (!fs.existsSync(logFile)) {
      return NextResponse.json(
        { error: `No se encontro el archivo de log para ${date}` },
        { status: 404 }
      );
    }

    const content = fs.readFileSync(logFile, 'utf-8');

    return new Response(content, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Content-Disposition': `attachment; filename="app-${date}.jsonl"`,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}
