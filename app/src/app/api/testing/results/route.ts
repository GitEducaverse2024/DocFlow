import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

interface TestRunRow {
  id: string;
  type: string;
  section: string | null;
  status: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration_seconds: number;
  results_json: string | null;
  created_at: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '10', 10), 100);

    const rows = db
      .prepare('SELECT * FROM test_runs ORDER BY created_at DESC LIMIT ?')
      .all(limit) as TestRunRow[];

    const results = rows.map((row) => ({
      ...row,
      results_json: row.results_json ? JSON.parse(row.results_json) : [],
    }));

    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error desconocido' },
      { status: 500 }
    );
  }
}
