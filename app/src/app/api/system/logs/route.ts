import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const LOG_DIR = process['env']['LOG_DIR'] || '/app/data/logs';

interface LogEntry {
  ts: string;
  level: string;
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const level = searchParams.get('level');
    const source = searchParams.get('source');
    const search = searchParams.get('search');
    const limit = Math.min(parseInt(searchParams.get('limit') || '200', 10), 1000);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

    const logFile = path.join(LOG_DIR, `app-${date}.jsonl`);

    if (!fs.existsSync(logFile)) {
      return NextResponse.json([]);
    }

    const raw = fs.readFileSync(logFile, 'utf-8');
    const lines = raw.trim().split('\n').filter(Boolean);

    let entries: LogEntry[] = [];
    for (const line of lines) {
      try {
        entries.push(JSON.parse(line));
      } catch {
        // Skip malformed lines
      }
    }

    // Apply filters
    if (level) {
      entries = entries.filter((e) => e.level === level);
    }
    if (source) {
      entries = entries.filter((e) => e.source === source);
    }
    if (search) {
      const searchLower = search.toLowerCase();
      entries = entries.filter(
        (e) =>
          e.message.toLowerCase().includes(searchLower) ||
          (e.metadata && JSON.stringify(e.metadata).toLowerCase().includes(searchLower))
      );
    }

    // Reverse chronological, limited
    entries.reverse();
    entries = entries.slice(0, limit);

    return NextResponse.json(entries);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}
