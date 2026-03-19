import { NextResponse } from 'next/server';
import db from '@/lib/db';

export const dynamic = 'force-dynamic';

const SETTINGS_KEY = 'catbot_error_history';
const MAX_ERRORS = 10;

export async function GET() {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(SETTINGS_KEY) as { value: string } | undefined;
    const errors = row ? JSON.parse(row.value) : [];
    return NextResponse.json({ errors });
  } catch {
    return NextResponse.json({ errors: [] });
  }
}

export async function POST(request: Request) {
  try {
    const error = await request.json();

    // Read existing history
    let errors: unknown[] = [];
    try {
      const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(SETTINGS_KEY) as { value: string } | undefined;
      if (row) errors = JSON.parse(row.value);
    } catch { /* ignore */ }

    errors.push(error);
    if (errors.length > MAX_ERRORS) errors = errors.slice(-MAX_ERRORS);

    // Upsert into settings
    db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run(SETTINGS_KEY, JSON.stringify(errors));

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Error guardando historial' }, { status: 500 });
  }
}
