import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

// Phase 161 (v30.0): coerce SQLite INTEGER 0/1 to JSON boolean, preserving null.
// Mirrors Phase 158-02 /api/models pattern.
const toBoolOrNull = (v: number | null | undefined): boolean | null =>
  v === null || v === undefined ? null : v === 1;

interface Row {
  alias: string;
  model_key: string;
  description: string | null;
  is_active: number;
  reasoning_effort: string | null;
  max_tokens: number | null;
  thinking_budget: number | null;
  cap_model_key: string | null; // NULL when LEFT JOIN has no match
  cap_supports_reasoning: number | null;
  cap_max_tokens: number | null;
  cap_is_local: number | null;
}

export async function GET() {
  try {
    const rows = db.prepare(`
      SELECT
        ma.alias,
        ma.model_key,
        ma.description,
        ma.is_active,
        ma.reasoning_effort,
        ma.max_tokens,
        ma.thinking_budget,
        mi.model_key AS cap_model_key,
        mi.supports_reasoning AS cap_supports_reasoning,
        mi.max_tokens_cap AS cap_max_tokens,
        mi.is_local AS cap_is_local
      FROM model_aliases ma
      LEFT JOIN model_intelligence mi ON mi.model_key = ma.model_key
      ORDER BY ma.alias
    `).all() as Row[];

    const aliases = rows.map(r => ({
      alias: r.alias,
      model_key: r.model_key,
      description: r.description ?? '',
      is_active: r.is_active,
      reasoning_effort: r.reasoning_effort as 'off' | 'low' | 'medium' | 'high' | null,
      max_tokens: r.max_tokens,
      thinking_budget: r.thinking_budget,
      capabilities: r.cap_model_key === null ? null : {
        supports_reasoning: toBoolOrNull(r.cap_supports_reasoning),
        max_tokens_cap: r.cap_max_tokens,
        is_local: toBoolOrNull(r.cap_is_local),
      },
    }));

    return NextResponse.json({ aliases });
  } catch (error) {
    logger.error('alias-routing', 'Failed to get aliases (enriched)', { error });
    return NextResponse.json({ error: 'Failed to load aliases' }, { status: 500 });
  }
}
